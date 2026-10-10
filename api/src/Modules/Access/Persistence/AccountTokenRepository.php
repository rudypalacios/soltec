<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Uuid;

/** Single-use links sent by email. Only the SHA-256 of a token is stored. */
final class AccountTokenRepository
{
    public const INVITATION = 'invitation';
    public const PASSWORD_RESET = 'password_reset';

    public function __construct(private readonly Connection $connection)
    {
    }

    /** Stores a new token and invalidates the unused ones of the same purpose: only the latest link works. */
    public function issue(
        string $userId,
        string $purpose,
        string $tokenHash,
        DateTimeImmutable $expiresAt,
        DateTimeImmutable $now,
    ): void {
        $this->invalidate($userId, $now, $purpose);
        $this->connection->executeStatement(
            'INSERT INTO account_tokens (id, user_id, purpose, token_hash, expires_at, created_at) '
            . 'VALUES (UNHEX(:id), UNHEX(:user_id), :purpose, :hash, :expires_at, :now)',
            [
                'id' => Uuid::toHex(Uuid::v7()),
                'user_id' => Uuid::toHex($userId),
                'purpose' => $purpose,
                'hash' => $tokenHash,
                'expires_at' => Timestamps::toDb($expiresAt),
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /** @return array{id: string, userId: string, expiresAt: DateTimeImmutable, used: bool}|null */
    public function find(string $tokenHash, string $purpose): ?array
    {
        $row = $this->connection->fetchAssociative(
            'SELECT LOWER(HEX(id)) AS id, LOWER(HEX(user_id)) AS user_id, expires_at, used_at '
            . 'FROM account_tokens WHERE token_hash = :hash AND purpose = :purpose',
            ['hash' => $tokenHash, 'purpose' => $purpose],
        );
        if ($row === false) {
            return null;
        }

        return [
            'id' => Uuid::fromHex(Row::string($row, 'id')),
            'userId' => Uuid::fromHex(Row::string($row, 'user_id')),
            'expiresAt' => Row::date($row, 'expires_at'),
            'used' => Row::nullableDate($row, 'used_at') !== null,
        ];
    }

    /** @return bool false when somebody else used the token first (a conditional UPDATE: one winner) */
    public function consume(string $id, DateTimeImmutable $now): bool
    {
        return $this->connection->executeStatement(
            'UPDATE account_tokens SET used_at = :now WHERE id = UNHEX(:id) AND used_at IS NULL AND expires_at > :now',
            ['id' => Uuid::toHex($id), 'now' => Timestamps::toDb($now)],
        ) === 1;
    }

    /** Marks the unused tokens of the user as used; all purposes when none is given. */
    public function invalidate(string $userId, DateTimeImmutable $now, ?string $purpose = null): void
    {
        $sql = 'UPDATE account_tokens SET used_at = :now WHERE user_id = UNHEX(:user_id) AND used_at IS NULL';
        $params = ['now' => Timestamps::toDb($now), 'user_id' => Uuid::toHex($userId)];
        if ($purpose !== null) {
            $sql .= ' AND purpose = :purpose';
            $params['purpose'] = $purpose;
        }
        $this->connection->executeStatement($sql, $params);
    }

    public function lastIssuedAt(string $userId, string $purpose): ?DateTimeImmutable
    {
        $value = $this->connection->fetchOne(
            'SELECT MAX(created_at) FROM account_tokens WHERE user_id = UNHEX(:user_id) AND purpose = :purpose',
            ['user_id' => Uuid::toHex($userId), 'purpose' => $purpose],
        );

        return is_string($value) ? Timestamps::fromDb($value) : null;
    }
}
