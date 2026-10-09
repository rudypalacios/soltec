<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Persistence;

use Doctrine\DBAL\Connection;
use LogicException;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;

/**
 * Appends to `audit_logs` (UNHEX and INET6_ATON of NULL are NULL). It runs inside the transaction of the change it
 * records, so a change and its trace are saved together or not at all. Passwords and tokens never reach the log:
 * such a key is a programming error.
 */
final class AuditLogger
{
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
            'INSERT INTO audit_logs (id, occurred_at, user_id, device_id, action, entity_type, entity_id, '
            . 'before_data, after_data, ip_address) VALUES (UNHEX(:id), :occurred_at, '
            . 'UNHEX(:user_id), UNHEX(:device_id), :action, :entity_type, UNHEX(:entity_id), :before, :after, '
            . 'INET6_ATON(:ip))',
            [
                'id' => Uuid::toHex(Uuid::v7()),
                'occurred_at' => Timestamps::toDb($this->clock->now()),
                'user_id' => $actor->userId === null ? null : Uuid::toHex($actor->userId),
                'device_id' => $actor->deviceId === null ? null : Uuid::toHex($actor->deviceId),
                'action' => $action,
                'entity_type' => $entityType,
                'entity_id' => $entityId === null ? null : Uuid::toHex($entityId),
                'before' => $before === null ? null : json_encode($before, JSON_THROW_ON_ERROR),
                'after' => $after === null ? null : json_encode($after, JSON_THROW_ON_ERROR),
                'ip' => $actor->ip,
            ],
        );
    }
}
