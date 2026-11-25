<?php

declare(strict_types=1);

namespace Soltec\Modules\Notifications\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\ParameterType;
use JsonException;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Notifications\Domain\NotificationRecord;
use Soltec\Modules\Notifications\Domain\NotificationType;

/**
 * Reads and writes `notifications`. Every read of a person's notices carries their id: nobody reads another's. Ids
 * cross the database as hex (see Uuid); the id is a time-ordered UUID, so ordering by it is ordering by creation.
 */
final class NotificationRepository
{
    private const COLUMNS = 'LOWER(HEX(n.id)) AS id, n.type, n.subject_type, LOWER(HEX(n.subject_id)) AS subject_id, '
        . 'LOWER(HEX(n.actor_id)) AS actor_id, a.name AS actor_name, n.data, n.read_at, n.created_at';

    public function __construct(private readonly Connection $connection)
    {
    }

    /**
     * Writes one notice. A `$dedupeKey` already used writes nothing.
     *
     * @param array<string, mixed> $data
     * @return bool whether a row was written
     */
    public function insert(
        string $id,
        string $userId,
        NotificationType $type,
        string $subjectType,
        string $subjectId,
        ?string $entryId,
        ?string $actorId,
        array $data,
        ?string $dedupeKey,
        DateTimeImmutable $now,
    ): bool {
        return $this->connection->executeStatement(
            'INSERT INTO notifications (id, user_id, type, subject_type, subject_id, entry_id, actor_id, data, '
            . 'dedupe_key, created_at, updated_at) VALUES (UNHEX(:id), UNHEX(:user), :type, :subject_type, '
            . 'UNHEX(:subject), UNHEX(:entry), UNHEX(:actor), :data, :dedupe, :now, :now) '
            . 'ON DUPLICATE KEY UPDATE id = id',
            [
                'id' => Uuid::toHex($id),
                'user' => Uuid::toHex($userId),
                'type' => $type->value,
                'subject_type' => $subjectType,
                'subject' => Uuid::toHex($subjectId),
                'entry' => $entryId === null ? null : Uuid::toHex($entryId),
                'actor' => $actorId === null ? null : Uuid::toHex($actorId),
                'data' => json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                'dedupe' => $dedupeKey,
                'now' => Timestamps::toDb($now),
            ],
        ) === 1;
    }

    /**
     * The person's active notices, newest first. `$before` is the id of the last one already shown.
     *
     * @return list<NotificationRecord> up to `$limit` rows
     */
    public function search(string $userId, bool $unreadOnly, ?string $before, int $limit): array
    {
        $sql = 'SELECT ' . self::COLUMNS . ' FROM notifications n LEFT JOIN users a ON a.id = n.actor_id '
            . 'WHERE n.user_id = UNHEX(:user) AND n.deleted_at IS NULL';
        $params = ['user' => Uuid::toHex($userId), 'limit' => $limit];
        if ($unreadOnly) {
            $sql .= ' AND n.read_at IS NULL';
        }
        if ($before !== null) {
            $sql .= ' AND n.id < UNHEX(:before)';
            $params['before'] = Uuid::toHex($before);
        }
        $sql .= ' ORDER BY n.id DESC LIMIT :limit';

        return array_map(
            $this->hydrate(...),
            $this->connection->fetchAllAssociative($sql, $params, ['limit' => ParameterType::INTEGER]),
        );
    }

    public function find(string $id, string $userId): ?NotificationRecord
    {
        $row = $this->connection->fetchAssociative(
            'SELECT ' . self::COLUMNS . ' FROM notifications n LEFT JOIN users a ON a.id = n.actor_id '
            . 'WHERE n.id = UNHEX(:id) AND n.user_id = UNHEX(:user) AND n.deleted_at IS NULL',
            ['id' => Uuid::toHex($id), 'user' => Uuid::toHex($userId)],
        );

        return $row === false ? null : $this->hydrate($row);
    }

    public function unreadCount(string $userId): int
    {
        $row = $this->connection->fetchAssociative(
            'SELECT COUNT(*) AS total FROM notifications WHERE user_id = UNHEX(:user) AND deleted_at IS NULL '
            . 'AND read_at IS NULL',
            ['user' => Uuid::toHex($userId)],
        );

        return $row === false ? 0 : Row::int($row, 'total');
    }

    /** How many notices the person got after the moment, read or not. */
    public function countCreatedAfter(string $userId, DateTimeImmutable $moment): int
    {
        $row = $this->connection->fetchAssociative(
            'SELECT COUNT(*) AS total FROM notifications WHERE user_id = UNHEX(:user) AND deleted_at IS NULL '
            . 'AND created_at > :moment',
            ['user' => Uuid::toHex($userId), 'moment' => Timestamps::toDb($moment)],
        );

        return $row === false ? 0 : Row::int($row, 'total');
    }

    /** Idempotent: a notice already read keeps the moment it was read. */
    public function markRead(string $id, string $userId, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE notifications SET read_at = :now, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id) AND user_id = UNHEX(:user) AND read_at IS NULL AND deleted_at IS NULL',
            ['now' => Timestamps::toDb($now), 'id' => Uuid::toHex($id), 'user' => Uuid::toHex($userId)],
        );
    }

    /** @return int how many notices were unread */
    public function markAllRead(string $userId, DateTimeImmutable $now): int
    {
        return (int) $this->connection->executeStatement(
            'UPDATE notifications SET read_at = :now, updated_at = :now, version = version + 1 '
            . 'WHERE user_id = UNHEX(:user) AND read_at IS NULL AND deleted_at IS NULL',
            ['now' => Timestamps::toDb($now), 'user' => Uuid::toHex($userId)],
        );
    }

    /**
     * Withdraws the notices that came from a comment (all of them, or only the mention ones of some people), because
     * the comment was deactivated or no longer mentions them. Nothing is deleted.
     *
     * @param list<string>|null $userIds null for every person told about the entry
     */
    public function retireEntry(string $entryId, ?array $userIds, DateTimeImmutable $now): void
    {
        $sql = 'UPDATE notifications SET deleted_at = :now, updated_at = :now, version = version + 1 '
            . 'WHERE entry_id = UNHEX(:entry) AND deleted_at IS NULL';
        $params = ['now' => Timestamps::toDb($now), 'entry' => Uuid::toHex($entryId)];
        $types = [];
        if ($userIds !== null) {
            if ($userIds === []) {
                return;
            }
            $sql .= " AND type = 'mention' AND LOWER(HEX(user_id)) IN (:users)";
            $params['users'] = array_map(Uuid::toHex(...), $userIds);
            $types['users'] = ArrayParameterType::STRING;
        }
        $this->connection->executeStatement($sql, $params, $types);
    }

    /**
     * The notices whose email is still to be sent, with what the email needs. With ids, only those.
     *
     * @param list<string>|null $ids
     * @return list<array{id: string, type: NotificationType, subject_type: string, subject_id: string,
     *     subject_title: string, actor_name: string|null, data: array<string, mixed>, to: string, name: string}>
     */
    public function pendingEmails(?array $ids, int $limit): array
    {
        $sql = 'SELECT ' . self::COLUMNS . ', u.email, u.name FROM notifications n '
            . 'JOIN users u ON u.id = n.user_id LEFT JOIN users a ON a.id = n.actor_id '
            . "WHERE n.email_status = 'pending' AND n.deleted_at IS NULL AND u.deleted_at IS NULL";
        $params = ['limit' => $limit];
        $types = ['limit' => ParameterType::INTEGER];
        if ($ids !== null) {
            if ($ids === []) {
                return [];
            }
            $sql .= ' AND LOWER(HEX(n.id)) IN (:ids)';
            $params['ids'] = array_map(Uuid::toHex(...), $ids);
            $types['ids'] = ArrayParameterType::STRING;
        }
        $sql .= ' ORDER BY n.id LIMIT :limit';

        $rows = [];
        foreach ($this->connection->fetchAllAssociative($sql, $params, $types) as $row) {
            $notice = $this->hydrate($row);
            $rows[] = [
                'id' => $notice->id,
                'type' => $notice->type,
                'subject_type' => $notice->subjectType,
                'subject_id' => $notice->subjectId,
                'subject_title' => $notice->subjectTitle,
                'actor_name' => $notice->actor['name'] ?? null,
                'data' => $notice->data,
                'to' => Row::string($row, 'email'),
                'name' => Row::string($row, 'name'),
            ];
        }

        return $rows;
    }

    /** Takes the notice for sending: false when another process already did, so nobody gets the email twice. */
    public function claimEmail(string $id): bool
    {
        return $this->connection->executeStatement(
            "UPDATE notifications SET email_status = 'sending' WHERE id = UNHEX(:id) AND email_status = 'pending'",
            ['id' => Uuid::toHex($id)],
        ) === 1;
    }

    public function markEmailSent(string $id): void
    {
        $this->connection->executeStatement(
            "UPDATE notifications SET email_status = 'sent', email_error = NULL WHERE id = UNHEX(:id)",
            ['id' => Uuid::toHex($id)],
        );
    }

    public function markEmailFailed(string $id, string $error): void
    {
        $this->connection->executeStatement(
            "UPDATE notifications SET email_status = 'failed', email_error = :error WHERE id = UNHEX(:id)",
            ['id' => Uuid::toHex($id), 'error' => mb_substr($error, 0, 255)],
        );
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): NotificationRecord
    {
        $data = $this->decode(Row::string($row, 'data'));
        $title = is_string($data['title'] ?? null) ? $data['title'] : '';
        unset($data['title']);
        $actorId = Row::nullableString($row, 'actor_id');
        $actorName = Row::nullableString($row, 'actor_name');

        return new NotificationRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            NotificationType::from(Row::string($row, 'type')),
            Row::string($row, 'subject_type'),
            Uuid::fromHex(Row::string($row, 'subject_id')),
            $title,
            $actorId === null || $actorName === null ? null : ['id' => Uuid::fromHex($actorId), 'name' => $actorName],
            $data,
            Row::nullableDate($row, 'read_at'),
            Row::date($row, 'created_at'),
        );
    }

    /** @return array<string, mixed> */
    private function decode(string $json): array
    {
        try {
            $decoded = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return [];
        }

        $data = [];
        foreach (is_array($decoded) ? $decoded : [] as $key => $value) {
            $data[(string) $key] = $value;
        }

        return $data;
    }
}
