<?php

declare(strict_types=1);

namespace Soltec\Modules\Thread\Application;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Access\Persistence\UserDirectory;
use Soltec\Modules\Files\Persistence\FileRepository;
use Soltec\Modules\Thread\Domain\Mentions;
use Soltec\Modules\Thread\Domain\ThreadCursor;
use Soltec\Modules\Thread\Domain\ThreadEntryRecord;
use Soltec\Modules\Thread\Domain\ThreadSubject;
use Soltec\Modules\Thread\Domain\ThreadSubjects;
use Soltec\Modules\Thread\Persistence\ThreadRepository;

/**
 * The activity thread of a record. Reading it needs to see the record (the subject answers; a record outside the
 * reader's reach is a 404). Comments are written by people and only their author edits or deactivates them; events are
 * written by the module that owns the record, in the same transaction as the change they describe, and never change.
 */
final class ThreadService
{
    public const MAX_BODY = 5000;
    public const MAX_FILES = 5;
    private const ENTITY = 'thread_entries';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly ThreadRepository $entries,
        private readonly ThreadSubjects $subjects,
        private readonly FileRepository $files,
        private readonly UserDirectory $users,
        private readonly AuditLogger $audit,
    ) {
    }

    /**
     * @return array{entries: list<ThreadEntryRecord>, next: ThreadCursor|null}
     * @throws ApiException 404 when the caller does not reach the record
     */
    public function list(CurrentUser $caller, string $type, string $subjectId, ?ThreadCursor $after, int $limit): array
    {
        $this->assertCanSee($caller, $type, $subjectId);

        return $this->entries->search($type, $subjectId, $after, $limit);
    }

    /**
     * Writes a comment. `$id` is the one the client chose, so a retry does not duplicate it: the same id from the same
     * author on the same record answers with the comment already stored.
     *
     * @param list<string> $fileIds photos the caller uploaded; at most {@see MAX_FILES}
     * @return array{entry: ThreadEntryRecord, created: bool}
     * @throws ApiException 404 or 409 `conflict` (the id belongs to another entry)
     * @throws ValidationException `body` (`required`, `invalid_mention`) or `file_ids` (`too_many`, `not_found`)
     */
    public function comment(
        CurrentUser $caller,
        ActorContext $actor,
        string $type,
        string $subjectId,
        ?string $id,
        string $body,
        array $fileIds,
    ): array {
        $this->assertCanSee($caller, $type, $subjectId);
        $id ??= Uuid::v7();
        $existing = $this->entries->find($id);
        if ($existing !== null) {
            return ['entry' => $this->sameComment($existing, $caller, $type, $subjectId, $body), 'created' => false];
        }

        $fileIds = array_values(array_unique($fileIds));
        if ($body === '' && $fileIds === []) {
            throw ValidationException::field('body', 'required');
        }
        $mentioned = $this->assertMentionable($type, $subjectId, $body);
        $this->assertPhotos($caller, $fileIds);

        try {
            $this->connection->transactional(function () use (
                $caller,
                $actor,
                $type,
                $subjectId,
                $id,
                $body,
                $fileIds,
                $mentioned,
            ): void {
                $this->entries->insert(
                    $id,
                    $type,
                    $subjectId,
                    ThreadEntryRecord::COMMENT,
                    $caller->id,
                    $body === '' ? null : $body,
                    null,
                    null,
                    $this->clock->now(),
                );
                $this->entries->replaceMentions($id, $mentioned);
                $this->entries->attachFiles($id, $fileIds);
                $this->audit->record($actor, 'create', self::ENTITY, $id, null, [
                    'subject_type' => $type,
                    'subject_id' => $subjectId,
                    'mentions' => $mentioned,
                    'file_ids' => $fileIds,
                ]);
            });
        } catch (UniqueConstraintViolationException) {
            // Two sends of the same id at once: the one that lost is a retry when it carries the same comment.
            $stored = $this->entries->find($id) ?? throw ApiException::conflict();

            return ['entry' => $this->sameComment($stored, $caller, $type, $subjectId, $body), 'created' => false];
        }

        return ['entry' => $this->entries->find($id) ?? throw ApiException::notFound(), 'created' => true];
    }

    /**
     * Replaces the text of a comment. Only its author, only while it is active.
     *
     * @throws ApiException 404, 403 `forbidden` (not the author), 409 `conflict` (stale version)
     * @throws ValidationException `body`
     */
    public function edit(
        CurrentUser $caller,
        ActorContext $actor,
        string $entryId,
        int $version,
        string $body,
    ): ThreadEntryRecord {
        $this->connection->transactional(function () use ($caller, $actor, $entryId, $version, $body): void {
            if (!$this->entries->lock($entryId)) {
                throw ApiException::notFound();
            }
            $entry = $this->ownComment($caller, $entryId);
            if ($body === '' && $entry->fileIds === []) {
                throw ValidationException::field('body', 'required');
            }
            $mentioned = $this->assertMentionable($entry->subjectType, $entry->subjectId, $body);
            if ($body === ($entry->body ?? '')) {
                return;
            }

            if (!$this->entries->updateBody($entryId, $version, $body, $this->clock->now())) {
                throw ApiException::conflict();
            }
            $this->entries->replaceMentions($entryId, $mentioned);
            $this->audit->record($actor, 'update', self::ENTITY, $entryId, ['body' => $entry->body], [
                'body' => $body === '' ? null : $body,
            ]);
        });

        return $this->entries->find($entryId) ?? throw ApiException::notFound();
    }

    /** Idempotent. The text stays in the audit log (nothing is deleted). */
    public function deactivate(CurrentUser $caller, ActorContext $actor, string $entryId): ThreadEntryRecord
    {
        $this->connection->transactional(function () use ($caller, $actor, $entryId): void {
            if (!$this->entries->lock($entryId)) {
                throw ApiException::notFound();
            }
            $entry = $this->entries->find($entryId) ?? throw ApiException::notFound();
            $this->assertCanSee($caller, $entry->subjectType, $entry->subjectId);
            if (!$entry->isComment()) {
                throw ApiException::notFound();
            }
            $this->assertAuthor($caller, $entry);
            if (!$entry->isActive()) {
                return;
            }

            $now = $this->clock->now();
            $this->entries->setDeletedAt($entryId, $now, $now);
            $this->audit->record($actor, 'deactivate', self::ENTITY, $entryId, ['is_active' => true], [
                'is_active' => false,
            ]);
        });

        return $this->entries->find($entryId) ?? throw ApiException::notFound();
    }

    /**
     * Writes an event of the record into its thread. Called by the module that owns the record inside the transaction
     * of the change, so the thread never tells something that did not happen.
     *
     * @param array<string, mixed> $data
     */
    public function recordEvent(
        string $type,
        string $subjectId,
        string $authorId,
        string $eventType,
        array $data,
        DateTimeImmutable $now,
    ): void {
        $this->entries->insert(
            Uuid::v7(),
            $type,
            $subjectId,
            ThreadEntryRecord::EVENT,
            $authorId,
            null,
            $eventType,
            $data,
            $now,
        );
    }

    /**
     * The people the caller can mention on a record: active internal users who reach it, matching the typed text.
     *
     * @return list<array{id: string, name: string}>
     */
    public function mentionOptions(
        CurrentUser $caller,
        string $type,
        string $subjectId,
        ?string $text,
        int $limit,
    ): array {
        $subject = $this->assertCanSee($caller, $type, $subjectId);
        // Look at more candidates than the page holds: some of them will not reach the record.
        $candidates = $this->users->search($text, 200);
        $reach = array_flip($subject->whoCanSee($subjectId, array_column($candidates, 'id')));

        return array_slice(
            array_values(array_filter($candidates, static fn (array $user): bool => isset($reach[$user['id']]))),
            0,
            $limit,
        );
    }

    private function assertCanSee(CurrentUser $caller, string $type, string $subjectId): ThreadSubject
    {
        $subject = $this->subjects->get($type);
        if (!$subject->canSee($caller, $subjectId)) {
            throw ApiException::notFound();
        }

        return $subject;
    }

    private function assertAuthor(CurrentUser $caller, ThreadEntryRecord $entry): void
    {
        if ($entry->authorId !== $caller->id) {
            throw ApiException::forbidden('forbidden', 'Only the author can change a comment.');
        }
    }

    /** The active comment of the caller, on a record they still reach. */
    private function ownComment(CurrentUser $caller, string $entryId): ThreadEntryRecord
    {
        $entry = $this->entries->find($entryId) ?? throw ApiException::notFound();
        $this->assertCanSee($caller, $entry->subjectType, $entry->subjectId);
        if (!$entry->isComment() || !$entry->isActive()) {
            throw ApiException::notFound();
        }
        $this->assertAuthor($caller, $entry);

        return $entry;
    }

    private function sameComment(
        ThreadEntryRecord $stored,
        CurrentUser $caller,
        string $type,
        string $subjectId,
        string $body,
    ): ThreadEntryRecord {
        $same = $stored->isComment() && $stored->authorId === $caller->id && $stored->subjectType === $type
            && $stored->subjectId === $subjectId && ($stored->body ?? '') === $body;

        return $same ? $stored : throw ApiException::conflict();
    }

    /**
     * The ids the text mentions, after checking each is an active internal user who reaches the record.
     *
     * @return list<string>
     * @throws ValidationException `body` `invalid_mention`
     */
    private function assertMentionable(string $type, string $subjectId, string $body): array
    {
        $ids = Mentions::idsIn($body);
        if ($ids === []) {
            return [];
        }
        $active = array_column($this->users->activeAmong($ids), 'id');
        $reach = $this->subjects->get($type)->whoCanSee($subjectId, $active);
        if (count($reach) !== count($ids)) {
            throw ValidationException::field('body', 'invalid_mention');
        }

        return $ids;
    }

    /**
     * @param list<string> $fileIds
     * @throws ValidationException `file_ids` `too_many` or `not_found`
     */
    private function assertPhotos(CurrentUser $caller, array $fileIds): void
    {
        if (count($fileIds) > self::MAX_FILES) {
            throw ValidationException::field('file_ids', 'too_many');
        }
        foreach ($fileIds as $fileId) {
            if ($this->files->activeUploader($fileId) !== $caller->id) {
                throw ValidationException::field('file_ids', 'not_found');
            }
        }
    }
}
