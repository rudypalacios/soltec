<?php

declare(strict_types=1);

namespace Soltec\Modules\Notifications\Application;

use DateTimeImmutable;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Clock;
use Soltec\Kernel\DeferredTasks;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Persistence\UserDirectory;
use Soltec\Modules\Notifications\Domain\NotificationRecord;
use Soltec\Modules\Notifications\Domain\NotificationType;
use Soltec\Modules\Notifications\Persistence\NotificationRepository;

/**
 * Tells people what happened (ADR-0031). The module that owns the record decides who is told and calls {@see publish()}
 * inside the transaction of the change, so a notice never tells something that did not happen. The email goes out
 * after the response, once the change is committed. Reading is always of the caller's own notices.
 */
final class NotificationService
{
    public function __construct(
        private readonly Clock $clock,
        private readonly NotificationRepository $notices,
        private readonly UserDirectory $users,
        private readonly NotificationMailer $mailer,
        private readonly DeferredTasks $deferred,
    ) {
    }

    /**
     * Writes one notice per recipient, in the application and (after the response) by email.
     *
     * Nobody is told of what they did themselves: the actor is dropped from the recipients. Only active internal users
     * are told. A reminder has no actor, and `$dedupeBase` makes it safe to publish again (the scheduled command runs
     * every hour): a person already told under the same base is not told twice.
     *
     * @param list<string> $recipients user ids
     * @param array<string, mixed> $data what the web needs to write the sentence (state names, dates)
     * @param string|null $entryId the thread comment the notice comes from, so deactivating it can withdraw the notice
     * @return list<string> the ids of the notices written
     */
    public function publish(
        NotificationType $type,
        array $recipients,
        ?string $actorId,
        string $subjectType,
        string $subjectId,
        string $subjectTitle,
        array $data,
        DateTimeImmutable $now,
        ?string $entryId = null,
        ?string $dedupeBase = null,
    ): array {
        $recipients = array_values(array_diff(array_unique($recipients), $actorId === null ? [] : [$actorId]));
        $told = array_column($this->users->activeAmong($recipients), 'id');

        $written = [];
        foreach ($told as $userId) {
            $id = Uuid::v7();
            $inserted = $this->notices->insert(
                $id,
                $userId,
                $type,
                $subjectType,
                $subjectId,
                $entryId,
                $actorId,
                ['title' => $subjectTitle] + $data,
                $dedupeBase === null ? null : $dedupeBase . ':' . $userId,
                $now,
            );
            if ($inserted) {
                $written[] = $id;
            }
        }
        if ($written !== []) {
            $this->deferred->defer(function () use ($written): void {
                $this->mailer->deliver($written);
            });
        }

        return $written;
    }

    /** Withdraws every notice that came from a comment (it was deactivated). */
    public function retireEntry(string $entryId): void
    {
        $this->notices->retireEntry($entryId, null, $this->clock->now());
    }

    /**
     * Withdraws the mention notices of the people a comment no longer mentions.
     *
     * @param list<string> $userIds
     */
    public function retireMentions(string $entryId, array $userIds): void
    {
        $this->notices->retireEntry($entryId, $userIds, $this->clock->now());
    }

    /**
     * The caller's notices, newest first, with how many are unread. `$before` is the id of the last one already shown.
     *
     * @return array{records: list<NotificationRecord>, next: string|null, unread: int}
     */
    public function list(CurrentUser $caller, bool $unreadOnly, ?string $before, int $limit): array
    {
        $records = $this->notices->search($caller->id, $unreadOnly, $before, $limit + 1);
        $next = null;
        if (count($records) > $limit) {
            $records = array_slice($records, 0, $limit);
            $next = $records[$limit - 1]->id;
        }

        return ['records' => $records, 'next' => $next, 'unread' => $this->notices->unreadCount($caller->id)];
    }

    /**
     * Marks one of the caller's notices as read. Idempotent.
     *
     * @throws ApiException 404 when the notice is not the caller's
     */
    public function markRead(CurrentUser $caller, string $id): NotificationRecord
    {
        if ($this->notices->find($id, $caller->id) === null) {
            throw ApiException::notFound();
        }
        $this->notices->markRead($id, $caller->id, $this->clock->now());

        return $this->notices->find($id, $caller->id) ?? throw ApiException::notFound();
    }

    /** @return int how many notices were unread */
    public function markAllRead(CurrentUser $caller): int
    {
        return $this->notices->markAllRead($caller->id, $this->clock->now());
    }

    /**
     * What the polling asks every minute: how many unread notices there are and, when the web says since when it has
     * been looking, how many arrived after that.
     *
     * @return array{unread_count: int, new_count: int|null, server_time: DateTimeImmutable}
     */
    public function updates(CurrentUser $caller, ?DateTimeImmutable $since): array
    {
        return [
            'unread_count' => $this->notices->unreadCount($caller->id),
            'new_count' => $since === null ? null : $this->notices->countCreatedAfter($caller->id, $since),
            'server_time' => $this->clock->now(),
        ];
    }
}
