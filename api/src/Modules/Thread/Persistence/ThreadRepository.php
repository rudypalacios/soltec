<?php

declare(strict_types=1);

namespace Soltec\Modules\Thread\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\ParameterType;
use JsonException;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Thread\Domain\ThreadCursor;
use Soltec\Modules\Thread\Domain\ThreadEntryRecord;

/**
 * Reads and writes `thread_entries` with their mentions and attached photos. It does no access check: the service
 * asks the subject first. Ids cross the database as hex (see Uuid).
 */
final class ThreadRepository
{
    private const COLUMNS = 'LOWER(HEX(e.id)) AS id, e.seq, e.subject_type, '
        . 'LOWER(HEX(e.subject_id)) AS subject_id, e.kind, '
        . 'LOWER(HEX(e.author_id)) AS author_id, u.name AS author_name, e.body, e.event_type, e.event_data, '
        . 'e.visibility, e.edited_at, e.created_at, e.updated_at, e.version, e.deleted_at';

    public function __construct(private readonly Connection $connection)
    {
    }

    public function find(string $id): ?ThreadEntryRecord
    {
        $row = $this->connection->fetchAssociative(
            'SELECT ' . self::COLUMNS . ' FROM thread_entries e JOIN users u ON u.id = e.author_id '
            . 'WHERE e.id = UNHEX(:id)',
            ['id' => Uuid::toHex($id)],
        );

        return $row === false ? null : $this->hydrateAll([$row])[0];
    }

    /** Locks the row until the end of the transaction. */
    public function lock(string $id): bool
    {
        return $this->connection->fetchOne(
            'SELECT 1 FROM thread_entries WHERE id = UNHEX(:id) FOR UPDATE',
            ['id' => Uuid::toHex($id)],
        ) !== false;
    }

    /**
     * Active entries of a record, newest first.
     *
     * @return array{entries: list<ThreadEntryRecord>, next: ThreadCursor|null}
     */
    public function search(string $type, string $subjectId, ?ThreadCursor $after, int $limit): array
    {
        $sql = 'SELECT ' . self::COLUMNS . ' FROM thread_entries e JOIN users u ON u.id = e.author_id '
            . 'WHERE e.subject_type = :type AND e.subject_id = UNHEX(:subject) AND e.deleted_at IS NULL';
        $params = ['type' => $type, 'subject' => Uuid::toHex($subjectId), 'limit' => $limit + 1];
        if ($after !== null) {
            $sql .= ' AND (e.created_at < :at OR (e.created_at = :at AND e.seq < :after_seq))';
            $params['at'] = Timestamps::toDb($after->createdAt);
            $params['after_seq'] = $after->seq;
        }
        $sql .= ' ORDER BY e.created_at DESC, e.seq DESC LIMIT :limit';

        $rows = $this->connection->fetchAllAssociative(
            $sql,
            $params,
            ['limit' => ParameterType::INTEGER],
        );
        $more = count($rows) > $limit;
        $entries = $this->hydrateAll(array_slice($rows, 0, $limit));
        $last = $entries === [] ? null : $entries[count($entries) - 1];

        return [
            'entries' => $entries,
            'next' => $more && $last !== null ? new ThreadCursor($last->createdAt, $last->seq) : null,
        ];
    }

    /** @param array<string, mixed>|null $eventData */
    public function insert(
        string $id,
        string $type,
        string $subjectId,
        string $kind,
        string $authorId,
        ?string $body,
        ?string $eventType,
        ?array $eventData,
        DateTimeImmutable $now,
    ): void {
        $this->connection->executeStatement(
            'INSERT INTO thread_entries (id, subject_type, subject_id, kind, author_id, body, event_type, event_data, '
            . 'created_at, updated_at) VALUES (UNHEX(:id), :type, UNHEX(:subject), :kind, UNHEX(:author), :body, '
            . ':event_type, :event_data, :now, :now)',
            [
                'id' => Uuid::toHex($id),
                'type' => $type,
                'subject' => Uuid::toHex($subjectId),
                'kind' => $kind,
                'author' => Uuid::toHex($authorId),
                'body' => $body,
                'event_type' => $eventType,
                'event_data' => $eventData === null ? null : json_encode($eventData, JSON_THROW_ON_ERROR),
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /** @return bool false when the version is stale */
    public function updateBody(string $id, int $version, string $body, DateTimeImmutable $now): bool
    {
        return $this->connection->executeStatement(
            'UPDATE thread_entries SET body = :body, edited_at = :now, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id) AND version = :version',
            [
                'id' => Uuid::toHex($id),
                'version' => $version,
                'body' => $body,
                'now' => Timestamps::toDb($now),
            ],
        ) === 1;
    }

    public function setDeletedAt(string $id, DateTimeImmutable $deletedAt, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE thread_entries SET deleted_at = :deleted_at, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id)',
            [
                'id' => Uuid::toHex($id),
                'deleted_at' => Timestamps::toDb($deletedAt),
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /** @param list<string> $userIds */
    public function replaceMentions(string $entryId, array $userIds): void
    {
        $this->connection->executeStatement(
            'DELETE FROM thread_entry_mentions WHERE entry_id = UNHEX(:id)',
            ['id' => Uuid::toHex($entryId)],
        );
        foreach ($userIds as $userId) {
            $this->connection->executeStatement(
                'INSERT INTO thread_entry_mentions (entry_id, user_id) VALUES (UNHEX(:entry), UNHEX(:user))',
                ['entry' => Uuid::toHex($entryId), 'user' => Uuid::toHex($userId)],
            );
        }
    }

    /** @param list<string> $fileIds */
    public function attachFiles(string $entryId, array $fileIds): void
    {
        foreach ($fileIds as $position => $fileId) {
            $this->connection->executeStatement(
                'INSERT INTO thread_entry_files (entry_id, file_id, sort_order) '
                . 'VALUES (UNHEX(:entry), UNHEX(:file), :position)',
                ['entry' => Uuid::toHex($entryId), 'file' => Uuid::toHex($fileId), 'position' => $position],
            );
        }
    }

    /**
     * Replaces the photos of a comment with these, in this order. The link rows are configuration of the comment, not
     * records: the photos themselves stay stored.
     *
     * @param list<string> $fileIds
     */
    public function replaceFiles(string $entryId, array $fileIds): void
    {
        $this->connection->executeStatement(
            'DELETE FROM thread_entry_files WHERE entry_id = UNHEX(:id)',
            ['id' => Uuid::toHex($entryId)],
        );
        $this->attachFiles($entryId, $fileIds);
    }

    /**
     * The records whose active thread entries carry this photo: whoever sees one of them sees the photo.
     *
     * @return list<array{type: string, id: string}>
     */
    public function subjectsHoldingFile(string $fileId): array
    {
        $rows = $this->connection->fetchAllAssociative(
            'SELECT DISTINCT e.subject_type, LOWER(HEX(e.subject_id)) AS subject_id FROM thread_entry_files f '
            . 'JOIN thread_entries e ON e.id = f.entry_id WHERE f.file_id = UNHEX(:file) AND e.deleted_at IS NULL',
            ['file' => Uuid::toHex($fileId)],
        );

        return array_map(
            static fn (array $row): array => [
                'type' => Row::string($row, 'subject_type'),
                'id' => Uuid::fromHex(Row::string($row, 'subject_id')),
            ],
            $rows,
        );
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<ThreadEntryRecord>
     */
    private function hydrateAll(array $rows): array
    {
        if ($rows === []) {
            return [];
        }
        $hexIds = array_map(static fn (array $row): string => Row::string($row, 'id'), $rows);
        $mentions = [];
        foreach (
            $this->connection->fetchAllAssociative(
                'SELECT LOWER(HEX(m.entry_id)) AS entry_id, LOWER(HEX(m.user_id)) AS user_id, u.name '
                . 'FROM thread_entry_mentions m JOIN users u ON u.id = m.user_id '
                . 'WHERE LOWER(HEX(m.entry_id)) IN (:ids) ORDER BY u.name, u.id',
                ['ids' => $hexIds],
                ['ids' => ArrayParameterType::STRING],
            ) as $row
        ) {
            $mentions[Row::string($row, 'entry_id')][] = [
                'id' => Uuid::fromHex(Row::string($row, 'user_id')),
                'name' => Row::string($row, 'name'),
            ];
        }
        $files = [];
        foreach (
            $this->connection->fetchAllAssociative(
                'SELECT LOWER(HEX(entry_id)) AS entry_id, LOWER(HEX(file_id)) AS file_id FROM thread_entry_files '
                . 'WHERE LOWER(HEX(entry_id)) IN (:ids) ORDER BY sort_order',
                ['ids' => $hexIds],
                ['ids' => ArrayParameterType::STRING],
            ) as $row
        ) {
            $files[Row::string($row, 'entry_id')][] = Uuid::fromHex(Row::string($row, 'file_id'));
        }

        return array_map(
            fn (array $row): ThreadEntryRecord => new ThreadEntryRecord(
                Uuid::fromHex(Row::string($row, 'id')),
                Row::int($row, 'seq'),
                Row::string($row, 'subject_type'),
                Uuid::fromHex(Row::string($row, 'subject_id')),
                Row::string($row, 'kind'),
                Uuid::fromHex(Row::string($row, 'author_id')),
                Row::string($row, 'author_name'),
                Row::nullableString($row, 'body'),
                Row::nullableString($row, 'event_type'),
                $this->decode(Row::nullableString($row, 'event_data')),
                Row::string($row, 'visibility'),
                Row::nullableDate($row, 'edited_at'),
                Row::date($row, 'created_at'),
                Row::date($row, 'updated_at'),
                Row::int($row, 'version'),
                Row::nullableDate($row, 'deleted_at'),
                $mentions[Row::string($row, 'id')] ?? [],
                $files[Row::string($row, 'id')] ?? [],
            ),
            $rows,
        );
    }

    /** @return array<string, mixed>|null */
    private function decode(?string $json): ?array
    {
        if ($json === null) {
            return null;
        }
        try {
            $decoded = json_decode($json, true, 8, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return null;
        }

        /** @var array<string, mixed>|null $result */
        $result = is_array($decoded) ? $decoded : null;

        return $result;
    }
}
