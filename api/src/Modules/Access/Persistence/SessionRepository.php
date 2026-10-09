<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Uuid;

/** Reads and writes `devices` and `refresh_tokens`: the sessions behind the access tokens. */
final class SessionRepository
{
    public function __construct(private readonly Connection $connection)
    {
    }

    /** The id of a device of this user that is still valid, or null (unknown, someone else's or revoked). */
    public function findUsableDeviceId(string $userId, string $deviceId): ?string
    {
        $found = $this->connection->fetchOne(
            'SELECT 1 FROM devices WHERE id = UNHEX(:id) AND user_id = UNHEX(:user_id) AND revoked_at IS NULL',
            ['id' => Uuid::toHex($deviceId), 'user_id' => Uuid::toHex($userId)],
        );

        return $found === false ? null : $deviceId;
    }

    public function createDevice(string $userId, string $platform, ?string $name, DateTimeImmutable $now): string
    {
        $id = Uuid::v7();
        $this->connection->executeStatement(
            'INSERT INTO devices (id, user_id, platform, name, last_seen_at, created_at, updated_at) '
            . 'VALUES (UNHEX(:id), UNHEX(:user_id), :platform, :name, :now, :now, :now)',
            [
                'id' => Uuid::toHex($id),
                'user_id' => Uuid::toHex($userId),
                'platform' => $platform,
                'name' => $name,
                'now' => Timestamps::toDb($now),
            ],
        );

        return $id;
    }

    public function touchDevice(string $deviceId, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE devices SET last_seen_at = :now, updated_at = :now WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($deviceId), 'now' => Timestamps::toDb($now)],
        );
    }

    public function insertRefreshToken(
        string $deviceId,
        string $tokenHash,
        DateTimeImmutable $expiresAt,
        DateTimeImmutable $now,
    ): void {
        $this->connection->executeStatement(
            'INSERT INTO refresh_tokens (id, device_id, token_hash, expires_at, created_at) '
            . 'VALUES (UNHEX(:id), UNHEX(:device_id), :hash, :expires_at, :now)',
            [
                'id' => Uuid::toHex(Uuid::v7()),
                'device_id' => Uuid::toHex($deviceId),
                'hash' => $tokenHash,
                'expires_at' => Timestamps::toDb($expiresAt),
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /**
     * @return array{
     *     id: string, deviceId: string, userId: string, platform: string, expiresAt: DateTimeImmutable,
     *     revokedAt: DateTimeImmutable|null, deviceRevoked: bool
     * }|null
     */
    public function findRefreshToken(string $tokenHash): ?array
    {
        $row = $this->connection->fetchAssociative(
            'SELECT LOWER(HEX(t.id)) AS id, LOWER(HEX(t.device_id)) AS device_id, LOWER(HEX(d.user_id)) AS user_id, '
            . 'd.platform, t.expires_at, t.revoked_at, d.revoked_at AS device_revoked_at '
            . 'FROM refresh_tokens t JOIN devices d ON d.id = t.device_id WHERE t.token_hash = :hash',
            ['hash' => $tokenHash],
        );
        if ($row === false) {
            return null;
        }

        return [
            'id' => Uuid::fromHex(Row::string($row, 'id')),
            'deviceId' => Uuid::fromHex(Row::string($row, 'device_id')),
            'userId' => Uuid::fromHex(Row::string($row, 'user_id')),
            'platform' => Row::string($row, 'platform'),
            'expiresAt' => Row::date($row, 'expires_at'),
            'revokedAt' => Row::nullableDate($row, 'revoked_at'),
            'deviceRevoked' => $row['device_revoked_at'] !== null,
        ];
    }

    /** @return bool true only for the caller that revoked it; a concurrent second caller gets false */
    public function revokeRefreshToken(string $tokenId, DateTimeImmutable $now): bool
    {
        return $this->connection->executeStatement(
            'UPDATE refresh_tokens SET revoked_at = :now WHERE id = UNHEX(:id) AND revoked_at IS NULL',
            ['id' => Uuid::toHex($tokenId), 'now' => Timestamps::toDb($now)],
        ) === 1;
    }

    /** Closes the session of one device: the device and every refresh token it holds. */
    public function revokeDevice(string $deviceId, DateTimeImmutable $now): void
    {
        $params = ['id' => Uuid::toHex($deviceId), 'now' => Timestamps::toDb($now)];
        $this->connection->executeStatement(
            'UPDATE refresh_tokens SET revoked_at = :now WHERE device_id = UNHEX(:id) AND revoked_at IS NULL',
            $params,
        );
        $this->connection->executeStatement(
            'UPDATE devices SET revoked_at = :now, updated_at = :now WHERE id = UNHEX(:id) AND revoked_at IS NULL',
            $params,
        );
    }

    /** Closes every session of a user, optionally keeping one device (the one that just changed the password). */
    public function revokeUserDevices(string $userId, DateTimeImmutable $now, ?string $exceptDeviceId = null): void
    {
        $ids = $this->connection->fetchFirstColumn(
            'SELECT LOWER(HEX(id)) FROM devices WHERE user_id = UNHEX(:user_id) AND revoked_at IS NULL',
            ['user_id' => Uuid::toHex($userId)],
        );
        foreach ($ids as $hex) {
            $deviceId = Uuid::fromHex(Row::scalarString($hex));
            if ($deviceId !== $exceptDeviceId) {
                $this->revokeDevice($deviceId, $now);
            }
        }
    }
}
