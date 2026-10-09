<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Query\QueryBuilder;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Auth\RoleRef;
use Soltec\Kernel\Auth\ScopedQuery;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Domain\UserRecord;

/** Reads and writes `users` and `user_roles`. Ids cross the database as hex (see Uuid). */
final class UserRepository
{
    public const RESOURCE = 'users';

    private const COLUMNS = 'LOWER(HEX(u.id)) AS id, u.type, u.name, u.email, u.password_hash, '
        . 'u.password_changed_at, u.must_change_password, u.failed_attempts, u.locked_until, u.last_login_at, '
        . 'u.created_at, u.updated_at, u.version, u.deleted_at';

    public function __construct(private readonly Connection $connection)
    {
    }

    /** @param CurrentUser|null $scope when given, a user outside the caller's data scope is not found */
    public function find(string $id, ?CurrentUser $scope = null): ?UserRecord
    {
        $query = $this->connection->createQueryBuilder()
            ->select(self::COLUMNS)
            ->from('users', 'u')
            ->where('u.id = UNHEX(:id)')
            ->setParameter('id', Uuid::toHex($id));
        if ($scope !== null) {
            ScopedQuery::restrict($query, $scope, self::RESOURCE, 'u.id');
        }

        $row = $query->executeQuery()->fetchAssociative();

        return $row === false ? null : $this->withRoles($this->hydrate($row));
    }

    public function findActiveByEmail(string $email): ?UserRecord
    {
        $row = $this->connection->fetchAssociative(
            'SELECT ' . self::COLUMNS . ' FROM users u WHERE u.active_email = :email',
            ['email' => $email],
        );

        return $row === false ? null : $this->withRoles($this->hydrate($row));
    }

    /**
     * @param string $status active, inactive or all
     * @return array{records: list<UserRecord>, total: int}
     */
    public function search(
        CurrentUser $scope,
        ?string $text,
        string $status,
        ?string $type,
        ?string $roleId,
        Pagination $page,
    ): array {
        $filtered = fn (QueryBuilder $query): QueryBuilder => $this->applyFilters(
            $query,
            $scope,
            $text,
            $status,
            $type,
            $roleId,
        );

        $total = $filtered($this->connection->createQueryBuilder()->select('COUNT(*)')->from('users', 'u'))
            ->executeQuery()
            ->fetchOne();

        $rows = $filtered($this->connection->createQueryBuilder()->select(self::COLUMNS)->from('users', 'u'))
            ->orderBy('u.name')
            ->addOrderBy('u.id')
            ->setFirstResult($page->offset())
            ->setMaxResults($page->perPage)
            ->executeQuery()
            ->fetchAllAssociative();

        return [
            'records' => $this->withRolesBatch(array_map($this->hydrate(...), $rows)),
            'total' => is_numeric($total) ? (int) $total : 0,
        ];
    }

    public function insert(
        string $id,
        string $type,
        string $name,
        string $email,
        string $passwordHash,
        bool $mustChangePassword,
        DateTimeImmutable $now,
    ): void {
        $this->connection->executeStatement(
            'INSERT INTO users (id, type, name, email, password_hash, password_changed_at, must_change_password, '
            . 'created_at, updated_at) '
            . 'VALUES (UNHEX(:id), :type, :name, :email, :hash, :now, :must_change, :now, :now)',
            [
                'id' => Uuid::toHex($id),
                'type' => $type,
                'name' => $name,
                'email' => $email,
                'hash' => $passwordHash,
                'now' => Timestamps::toDb($now),
                'must_change' => $mustChangePassword ? 1 : 0,
            ],
        );
    }

    /** @return bool false when the version is stale or the user does not exist */
    public function updateProfile(string $id, int $version, string $name, string $email, DateTimeImmutable $now): bool
    {
        return $this->connection->executeStatement(
            'UPDATE users SET name = :name, email = :email, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id) AND version = :version',
            [
                'id' => Uuid::toHex($id),
                'version' => $version,
                'name' => $name,
                'email' => $email,
                'now' => Timestamps::toDb($now),
            ],
        ) === 1;
    }

    /** Deactivates (a date) or reactivates (null); a reactivated account starts without lock or failed attempts. */
    public function setDeletedAt(string $id, ?DateTimeImmutable $deletedAt, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE users SET deleted_at = :deleted_at, failed_attempts = 0, locked_until = NULL, '
            . 'updated_at = :now, version = version + 1 WHERE id = UNHEX(:id)',
            [
                'id' => Uuid::toHex($id),
                'deleted_at' => $deletedAt === null ? null : Timestamps::toDb($deletedAt),
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    public function updatePassword(string $id, string $hash, bool $mustChange, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE users SET password_hash = :hash, password_changed_at = :now, must_change_password = :must_change, '
            . 'updated_at = :now, version = version + 1 WHERE id = UNHEX(:id)',
            [
                'id' => Uuid::toHex($id),
                'hash' => $hash,
                'must_change' => $mustChange ? 1 : 0,
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /** Replaces the hash when the algorithm default changed; does not touch the version (not a user change). */
    public function rehashPassword(string $id, string $hash): void
    {
        $this->connection->executeStatement(
            'UPDATE users SET password_hash = :hash WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($id), 'hash' => $hash],
        );
    }

    /**
     * Counts a failed login without reading the counter first (no read-modify-write), and locks the account
     * when the limit is reached. An expired lock restarts the counter from zero.
     */
    public function registerFailedLogin(
        string $id,
        DateTimeImmutable $now,
        int $maxAttempts,
        DateTimeImmutable $lockUntil,
    ): void {
        $hex = Uuid::toHex($id);
        $this->connection->executeStatement(
            'UPDATE users SET failed_attempts = 0, locked_until = NULL '
            . 'WHERE id = UNHEX(:id) AND locked_until IS NOT NULL AND locked_until <= :now',
            ['id' => $hex, 'now' => Timestamps::toDb($now)],
        );
        $this->connection->executeStatement(
            'UPDATE users SET failed_attempts = LEAST(failed_attempts + 1, 255) WHERE id = UNHEX(:id)',
            ['id' => $hex],
        );
        $this->connection->executeStatement(
            'UPDATE users SET locked_until = :until WHERE id = UNHEX(:id) AND failed_attempts >= :max '
            . 'AND locked_until IS NULL',
            ['id' => $hex, 'max' => $maxAttempts, 'until' => Timestamps::toDb($lockUntil)],
        );
    }

    public function registerSuccessfulLogin(string $id, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = :now WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($id), 'now' => Timestamps::toDb($now)],
        );
    }

    /** @param list<string> $roleIds */
    public function replaceRoles(string $userId, array $roleIds): void
    {
        $this->connection->executeStatement('DELETE FROM user_roles WHERE user_id = UNHEX(:id)', [
            'id' => Uuid::toHex($userId),
        ]);
        foreach ($roleIds as $roleId) {
            $this->connection->executeStatement(
                'INSERT INTO user_roles (user_id, role_id) VALUES (UNHEX(:user_id), UNHEX(:role_id))',
                ['user_id' => Uuid::toHex($userId), 'role_id' => Uuid::toHex($roleId)],
            );
        }
    }

    /**
     * Locks the active administrators until the end of the transaction and returns their ids, so two administrators
     * demoting each other at the same time cannot leave the system without one.
     *
     * @return list<string>
     */
    public function lockActiveAdministratorIds(): array
    {
        $ids = $this->connection->fetchFirstColumn(
            'SELECT LOWER(HEX(u.id)) FROM users u '
            . 'JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id '
            . "WHERE u.deleted_at IS NULL AND r.code = 'admin' AND r.deleted_at IS NULL FOR UPDATE",
        );

        return array_map(static fn (mixed $id): string => Uuid::fromHex(Row::scalarString($id)), $ids);
    }

    public function hasActiveAdministrator(): bool
    {
        return $this->connection->fetchOne(
            'SELECT COUNT(*) FROM users u JOIN user_roles ur ON ur.user_id = u.id '
            . "JOIN roles r ON r.id = ur.role_id WHERE u.deleted_at IS NULL AND r.code = 'admin'",
        ) > 0;
    }

    private function applyFilters(
        QueryBuilder $query,
        CurrentUser $scope,
        ?string $text,
        string $status,
        ?string $type,
        ?string $roleId,
    ): QueryBuilder {
        ScopedQuery::restrict($query, $scope, self::RESOURCE, 'u.id');
        if ($status === 'active') {
            $query->andWhere('u.deleted_at IS NULL');
        } elseif ($status === 'inactive') {
            $query->andWhere('u.deleted_at IS NOT NULL');
        }
        if ($text !== null && $text !== '') {
            $query
                ->andWhere('(u.name LIKE :text OR u.email LIKE :text)')
                ->setParameter('text', '%' . addcslashes($text, '%_\\') . '%');
        }
        if ($type !== null) {
            $query->andWhere('u.type = :type')->setParameter('type', $type);
        }
        if ($roleId !== null) {
            $query
                ->andWhere('EXISTS (SELECT 1 FROM user_roles f WHERE f.user_id = u.id AND f.role_id = UNHEX(:role_id))')
                ->setParameter('role_id', Uuid::toHex($roleId));
        }

        return $query;
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): UserRecord
    {
        return new UserRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            Row::string($row, 'type'),
            Row::string($row, 'name'),
            Row::string($row, 'email'),
            Row::nullableString($row, 'password_hash'),
            Row::nullableDate($row, 'password_changed_at'),
            Row::bool($row, 'must_change_password'),
            Row::int($row, 'failed_attempts'),
            Row::nullableDate($row, 'locked_until'),
            Row::nullableDate($row, 'last_login_at'),
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
            Row::nullableDate($row, 'deleted_at'),
        );
    }

    private function withRoles(UserRecord $user): UserRecord
    {
        return $this->withRolesBatch([$user])[0];
    }

    /**
     * @param list<UserRecord> $users
     * @return list<UserRecord>
     */
    private function withRolesBatch(array $users): array
    {
        if ($users === []) {
            return [];
        }

        $hexIds = array_map(static fn (UserRecord $user): string => Uuid::toHex($user->id), $users);
        $rows = $this->connection->executeQuery(
            'SELECT LOWER(HEX(ur.user_id)) AS user_id, LOWER(HEX(r.id)) AS id, r.code, r.name '
            . 'FROM user_roles ur JOIN roles r ON r.id = ur.role_id '
            . 'WHERE ur.user_id IN (' . implode(',', array_fill(0, count($hexIds), 'UNHEX(?)')) . ') '
            . 'ORDER BY r.name',
            $hexIds,
        )->fetchAllAssociative();

        $byUser = [];
        foreach ($rows as $row) {
            $byUser[Uuid::fromHex(Row::string($row, 'user_id'))][] = new RoleRef(
                Uuid::fromHex(Row::string($row, 'id')),
                Row::nullableString($row, 'code'),
                Row::string($row, 'name'),
            );
        }

        return array_map(
            static fn (UserRecord $user): UserRecord => $user->withRoles($byUser[$user->id] ?? []),
            $users,
        );
    }
}
