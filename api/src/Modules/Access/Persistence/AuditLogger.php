<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Persistence;

use Doctrine\DBAL\Connection;
use LogicException;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Domain\AuditEntityLabels;

/**
 * Appends to `audit_logs` (UNHEX and INET6_ATON of NULL are NULL). It runs inside the transaction of the change it
 * records, so a change and its trace are saved together or not at all. Passwords and tokens never reach the log:
 * such a key is a programming error.
 *
 * It also stores the name of the record and of who acted at that moment (`entity_label`, `user_label`), read inside
 * the same transaction, so a later rename does not rewrite what the entry says.
 */
final class AuditLogger
{
    /** Entries per statement of {@see recordMany()}: the placeholders of one INSERT stay far below any limit. */
    private const BATCH = 100;

    private const FORBIDDEN_KEYS = [
        'password', 'password_hash', 'initial_password', 'current_password', 'new_password', 'token', 'refresh_token',
    ];

    public function __construct(private readonly Connection $connection, private readonly Clock $clock)
    {
    }

    /**
     * @param array<string, mixed>|null $before only the fields that changed
     * @param array<string, mixed>|null $after only the fields that changed
     */
    public function record(
        ActorContext $actor,
        string $action,
        string $entityType,
        ?string $entityId,
        ?array $before,
        ?array $after,
    ): void {
        foreach ([$before, $after] as $data) {
            foreach (array_keys($data ?? []) as $key) {
                if (in_array($key, self::FORBIDDEN_KEYS, true)) {
                    throw new LogicException(sprintf('The audit log must not carry "%s".', $key));
                }
            }
        }

        $this->connection->executeStatement(
            'INSERT INTO audit_logs (id, occurred_at, user_id, user_label, device_id, action, entity_type, entity_id, '
            . 'entity_label, before_data, after_data, ip_address) VALUES (UNHEX(:id), :occurred_at, '
            . 'UNHEX(:user_id), :user_label, UNHEX(:device_id), :action, :entity_type, UNHEX(:entity_id), '
            . ':entity_label, :before, :after, INET6_ATON(:ip))',
            [
                'id' => Uuid::toHex(Uuid::v7()),
                'occurred_at' => Timestamps::toDb($this->clock->now()),
                'user_id' => $actor->userId === null ? null : Uuid::toHex($actor->userId),
                'user_label' => $actor->userName ?? $this->labelOf('users', $actor->userId),
                'device_id' => $actor->deviceId === null ? null : Uuid::toHex($actor->deviceId),
                'action' => $action,
                'entity_type' => $entityType,
                'entity_id' => $entityId === null ? null : Uuid::toHex($entityId),
                'entity_label' => $this->labelOf($entityType, $entityId),
                'before' => $before === null ? null : json_encode($before, JSON_THROW_ON_ERROR),
                'after' => $after === null ? null : json_encode($after, JSON_THROW_ON_ERROR),
                'ip' => $actor->ip,
            ],
        );
    }

    /**
     * One entry per record for the same action, written with a few statements instead of two queries each: a bulk
     * change or a cascade over thousands of records is audited record by record (ADR-0023) without paying a round
     * trip for every one. The name each record has now is stored with its entry, like {@see record()} does.
     *
     * @param list<array{id: string, before: array<string, mixed>|null, after: array<string, mixed>|null}> $entries
     */
    public function recordMany(ActorContext $actor, string $action, string $entityType, array $entries): void
    {
        $userLabel = $actor->userName ?? $this->labelOf('users', $actor->userId);
        $now = Timestamps::toDb($this->clock->now());
        foreach (array_chunk($entries, self::BATCH) as $chunk) {
            $labels = $this->labelsOf($entityType, array_column($chunk, 'id'));
            $values = [];
            $params = [];
            foreach ($chunk as $index => $entry) {
                foreach ([$entry['before'], $entry['after']] as $data) {
                    foreach (array_keys($data ?? []) as $key) {
                        if (in_array($key, self::FORBIDDEN_KEYS, true)) {
                            throw new LogicException(sprintf('The audit log must not carry "%s".', $key));
                        }
                    }
                }
                $values[] = sprintf(
                    '(UNHEX(:id%1$d), :at, UNHEX(:user), :user_label, UNHEX(:device), :action, :type, '
                    . 'UNHEX(:entity%1$d), :label%1$d, :before%1$d, :after%1$d, INET6_ATON(:ip))',
                    $index,
                );
                $params['id' . $index] = Uuid::toHex(Uuid::v7());
                $params['entity' . $index] = Uuid::toHex($entry['id']);
                $params['label' . $index] = $labels[$entry['id']] ?? null;
                $params['before' . $index] = $entry['before'] === null
                    ? null
                    : json_encode($entry['before'], JSON_THROW_ON_ERROR);
                $params['after' . $index] = $entry['after'] === null
                    ? null
                    : json_encode($entry['after'], JSON_THROW_ON_ERROR);
            }

            $this->connection->executeStatement(
                'INSERT INTO audit_logs (id, occurred_at, user_id, user_label, device_id, action, entity_type, '
                . 'entity_id, entity_label, before_data, after_data, ip_address) VALUES ' . implode(', ', $values),
                $params + [
                    'at' => $now,
                    'user' => $actor->userId === null ? null : Uuid::toHex($actor->userId),
                    'user_label' => $userLabel,
                    'device' => $actor->deviceId === null ? null : Uuid::toHex($actor->deviceId),
                    'action' => $action,
                    'type' => $entityType,
                    'ip' => $actor->ip,
                ],
            );
        }
    }

    /**
     * The names records have right now, by id; empty when the type has no name.
     *
     * @param list<string> $ids
     * @return array<string, string>
     */
    private function labelsOf(string $entityType, array $ids): array
    {
        $table = AuditEntityLabels::tableOf($entityType);
        if ($table === null || $ids === []) {
            return [];
        }

        $placeholders = [];
        $params = [];
        foreach ($ids as $index => $id) {
            $placeholders[] = sprintf('UNHEX(:id%d)', $index);
            $params['id' . $index] = Uuid::toHex($id);
        }
        $rows = $this->connection->fetchAllAssociative(
            sprintf('SELECT LOWER(HEX(id)) AS id, name FROM %s WHERE id IN (%s)', $table, implode(', ', $placeholders)),
            $params,
        );

        $labels = [];
        foreach ($rows as $row) {
            $labels[Uuid::fromHex(Row::string($row, 'id'))] = mb_substr(
                Row::string($row, 'name'),
                0,
                AuditEntityLabels::MAX_LENGTH,
            );
        }

        return $labels;
    }

    /** The record's name right now, or null when its type has no name or the record is not there. */
    private function labelOf(string $entityType, ?string $entityId): ?string
    {
        $table = AuditEntityLabels::tableOf($entityType);
        if ($table === null || $entityId === null) {
            return null;
        }

        $name = $this->connection->fetchOne(
            sprintf('SELECT name FROM %s WHERE id = UNHEX(:id)', $table),
            ['id' => Uuid::toHex($entityId)],
        );

        return is_string($name) ? mb_substr($name, 0, AuditEntityLabels::MAX_LENGTH) : null;
    }
}
