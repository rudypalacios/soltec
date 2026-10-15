<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Query\QueryBuilder;
use Soltec\Kernel\Auth\RoleRef;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Domain\RoleRecord;

/** Reads and writes `roles`, their matrix (`role_permissions`, `role_scopes`) and the access catalogs. */
final class RoleRepository
{
    private const COLUMNS = 'LOWER(HEX(r.id)) AS id, r.code, r.name, r.description, r.user_type, r.is_system, '
        . 'r.created_at, r.updated_at, r.version, r.deleted_at';

    public function __construct(private readonly Connection $connection)
    {
    }

    public function find(string $id): ?RoleRecord
    {
        $row = $this->connection->fetchAssociative(
            'SELECT ' . self::COLUMNS . ' FROM roles r WHERE r.id = UNHEX(:id)',
            ['id' => Uuid::toHex($id)],
        );

        return $row === false ? null : $this->withMatrixBatch([$this->hydrate($row)])[0];
    }

    /** The id of a system role such as `admin`, or null when the seed did not run. */
    public function findIdByCode(string $code): ?string
    {
        $hex = $this->connection->fetchOne('SELECT LOWER(HEX(id)) FROM roles WHERE code = :code', ['code' => $code]);

        return $hex === false ? null : Uuid::fromHex(Row::scalarString($hex));
    }

    /**
     * @param string $status active, inactive or all
     * @return array{records: list<RoleRecord>, total: int}
     */
    public function search(?string $text, string $status, ?string $userType, Pagination $page): array
    {
        $filtered = function (QueryBuilder $query) use ($text, $status, $userType): QueryBuilder {
            if ($status === 'active') {
                $query->andWhere('r.deleted_at IS NULL');
            } elseif ($status === 'inactive') {
                $query->andWhere('r.deleted_at IS NOT NULL');
            }
            if ($text !== null && $text !== '') {
                $query->andWhere('r.name LIKE :text')->setParameter('text', '%' . addcslashes($text, '%_\\') . '%');
            }
            if ($userType !== null) {
                $query->andWhere('r.user_type = :user_type')->setParameter('user_type', $userType);
            }

            return $query;
        };

        $total = $filtered($this->connection->createQueryBuilder()->select('COUNT(*)')->from('roles', 'r'))
            ->executeQuery()
            ->fetchOne();
        $rows = $filtered($this->connection->createQueryBuilder()->select(self::COLUMNS)->from('roles', 'r'))
            ->orderBy('r.name')
            ->addOrderBy('r.id')
            ->setFirstResult($page->offset())
            ->setMaxResults($page->perPage)
            ->executeQuery()
            ->fetchAllAssociative();

        return [
            'records' => $this->withMatrixBatch(array_map($this->hydrate(...), $rows)),
            'total' => is_numeric($total) ? (int) $total : 0,
        ];
    }

    /**
     * The given ids that are active roles for the user type. Unknown ids are simply absent from the result:
     * the caller compares counts, so a client can never attach a role that does not exist (ADR-0012).
     *
     * @param list<string> $ids
     * @return list<RoleRef>
     */
    public function findAssignable(array $ids, string $userType): array
    {
        if ($ids === []) {
            return [];
        }

        $rows = $this->connection->executeQuery(
            'SELECT LOWER(HEX(id)) AS id, code, name FROM roles WHERE user_type = ? AND deleted_at IS NULL '
            . 'AND id IN (' . implode(',', array_fill(0, count($ids), 'UNHEX(?)')) . ')',
            [$userType, ...array_map(Uuid::toHex(...), $ids)],
        )->fetchAllAssociative();

        return array_map(
            static fn (array $row): RoleRef => new RoleRef(
                Uuid::fromHex(Row::string($row, 'id')),
                Row::nullableString($row, 'code'),
                Row::string($row, 'name'),
            ),
            $rows,
        );
    }

    public function insert(
        string $id,
        string $name,
        ?string $description,
        string $userType,
        DateTimeImmutable $now,
    ): void {
        $this->connection->executeStatement(
            'INSERT INTO roles (id, name, description, user_type, created_at, updated_at) '
            . 'VALUES (UNHEX(:id), :name, :description, :user_type, :now, :now)',
            [
                'id' => Uuid::toHex($id),
                'name' => $name,
                'description' => $description,
                'user_type' => $userType,
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /** @return bool false when the version is stale or the role does not exist */
    public function updateDetails(
        string $id,
        int $version,
        string $name,
        ?string $description,
        DateTimeImmutable $now,
    ): bool {
        return $this->connection->executeStatement(
            'UPDATE roles SET name = :name, description = :description, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id) AND version = :version',
            [
                'id' => Uuid::toHex($id),
                'version' => $version,
                'name' => $name,
                'description' => $description,
                'now' => Timestamps::toDb($now),
            ],
        ) === 1;
    }

    public function setDeletedAt(string $id, ?DateTimeImmutable $deletedAt, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE roles SET deleted_at = :deleted_at, updated_at = :now, version = version + 1 WHERE id = UNHEX(:id)',
            [
                'id' => Uuid::toHex($id),
                'deleted_at' => $deletedAt === null ? null : Timestamps::toDb($deletedAt),
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /**
     * Replaces the whole matrix of a role.
     *
     * @param array<string, list<string>> $permissions
     * @param array<string, string> $scopes
     */
    public function replaceMatrix(string $roleId, array $permissions, array $scopes): void
    {
        $params = ['id' => Uuid::toHex($roleId)];
        $this->connection->executeStatement('DELETE FROM role_permissions WHERE role_id = UNHEX(:id)', $params);
        $this->connection->executeStatement('DELETE FROM role_scopes WHERE role_id = UNHEX(:id)', $params);
        foreach ($permissions as $resource => $actions) {
            foreach ($actions as $action) {
                $this->connection->executeStatement(
                    'INSERT INTO role_permissions (role_id, resource_code, permission_code) '
                    . 'VALUES (UNHEX(:id), :resource, :action)',
                    $params + ['resource' => $resource, 'action' => $action],
                );
            }
        }
        foreach ($scopes as $resource => $scope) {
            $this->connection->executeStatement(
                'INSERT INTO role_scopes (role_id, resource_code, scope) VALUES (UNHEX(:id), :resource, :scope)',
                $params + ['resource' => $resource, 'scope' => $scope],
            );
        }
    }

    /**
     * Replaces the widgets of a role, in the order given.
     *
     * @param list<string> $widgets
     */
    public function replaceWidgets(string $roleId, array $widgets): void
    {
        $this->connection->executeStatement('DELETE FROM role_widgets WHERE role_id = UNHEX(:id)', [
            'id' => Uuid::toHex($roleId),
        ]);
        foreach ($widgets as $index => $code) {
            $this->connection->executeStatement(
                'INSERT INTO role_widgets (role_id, widget_code, position) VALUES (UNHEX(:id), :code, :position)',
                ['id' => Uuid::toHex($roleId), 'code' => $code, 'position' => $index + 1],
            );
        }
    }

    /**
     * The widgets of the active roles of a user: each one once, in the position of the role that puts it first.
     *
     * @return list<string>
     */
    public function widgetsOfUser(string $userId): array
    {
        $codes = $this->connection->fetchFirstColumn(
            'SELECT rw.widget_code FROM role_widgets rw JOIN user_roles ur ON ur.role_id = rw.role_id '
            . 'JOIN roles r ON r.id = rw.role_id WHERE ur.user_id = UNHEX(:id) AND r.deleted_at IS NULL '
            . 'GROUP BY rw.widget_code ORDER BY MIN(rw.position), rw.widget_code',
            ['id' => Uuid::toHex($userId)],
        );

        return array_map(Row::scalarString(...), $codes);
    }

    public function countActiveUsers(string $roleId): int
    {
        $count = $this->connection->fetchOne(
            'SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id '
            . 'WHERE ur.role_id = UNHEX(:id) AND u.deleted_at IS NULL',
            ['id' => Uuid::toHex($roleId)],
        );

        return is_numeric($count) ? (int) $count : 0;
    }

    /**
     * The resources a role of the matrix can hold: the internal ones, because only internal roles exist until the
     * client portal. `scoped` says whether the rows of the resource have an owner, so a data scope applies to it.
     *
     * @return list<array{code: string, name: string, scoped: bool}>
     */
    public function resources(): array
    {
        $rows = $this->connection->fetchAllAssociative(
            "SELECT code, name, scoped FROM resources WHERE audience = 'internal' ORDER BY code",
        );

        return array_map(
            static fn (array $row): array => [
                'code' => Row::string($row, 'code'),
                'name' => Row::string($row, 'name'),
                'scoped' => Row::bool($row, 'scoped'),
            ],
            $rows,
        );
    }

    /** @return list<array{code: string, name: string}> */
    public function permissions(): array
    {
        return $this->catalog('permissions');
    }

    /** @return list<array{code: string, name: string}> */
    private function catalog(string $table): array
    {
        $rows = $this->connection->fetchAllAssociative(sprintf('SELECT code, name FROM %s ORDER BY code', $table));

        return array_map(
            static fn (array $row): array => ['code' => Row::string($row, 'code'), 'name' => Row::string($row, 'name')],
            $rows,
        );
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): RoleRecord
    {
        return new RoleRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            Row::nullableString($row, 'code'),
            Row::string($row, 'name'),
            Row::nullableString($row, 'description'),
            Row::string($row, 'user_type'),
            Row::bool($row, 'is_system'),
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
            Row::nullableDate($row, 'deleted_at'),
        );
    }

    /**
     * @param list<RoleRecord> $roles
     * @return list<RoleRecord>
     */
    private function withMatrixBatch(array $roles): array
    {
        if ($roles === []) {
            return [];
        }

        $hexIds = array_map(static fn (RoleRecord $role): string => Uuid::toHex($role->id), $roles);
        $in = implode(',', array_fill(0, count($hexIds), 'UNHEX(?)'));

        $permissions = [];
        foreach (
            $this->connection->executeQuery(
                'SELECT LOWER(HEX(role_id)) AS role_id, resource_code, permission_code FROM role_permissions '
                . 'WHERE role_id IN (' . $in . ') ORDER BY resource_code, permission_code',
                $hexIds,
            )->fetchAllAssociative() as $row
        ) {
            $permissions[Uuid::fromHex(Row::string($row, 'role_id'))][Row::string($row, 'resource_code')][]
                = Row::string($row, 'permission_code');
        }

        $scopes = [];
        foreach (
            $this->connection->executeQuery(
                'SELECT LOWER(HEX(role_id)) AS role_id, resource_code, scope FROM role_scopes '
                . 'WHERE role_id IN (' . $in . ') ORDER BY resource_code',
                $hexIds,
            )->fetchAllAssociative() as $row
        ) {
            $scopes[Uuid::fromHex(Row::string($row, 'role_id'))][Row::string($row, 'resource_code')]
                = Row::string($row, 'scope');
        }

        $widgets = [];
        foreach (
            $this->connection->executeQuery(
                'SELECT LOWER(HEX(role_id)) AS role_id, widget_code FROM role_widgets '
                . 'WHERE role_id IN (' . $in . ') ORDER BY position',
                $hexIds,
            )->fetchAllAssociative() as $row
        ) {
            $widgets[Uuid::fromHex(Row::string($row, 'role_id'))][] = Row::string($row, 'widget_code');
        }

        return array_map(
            static fn (RoleRecord $role): RoleRecord => $role->withMatrix(
                $permissions[$role->id] ?? [],
                $scopes[$role->id] ?? [],
                $widgets[$role->id] ?? [],
            ),
            $roles,
        );
    }
}
