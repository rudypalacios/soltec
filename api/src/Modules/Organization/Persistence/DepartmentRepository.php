<?php

declare(strict_types=1);

namespace Soltec\Modules\Organization\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Query\QueryBuilder;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Organization\Domain\DepartmentRecord;

/** Reads and writes `departments`. Ids cross the database as hex (see Uuid). */
final class DepartmentRepository
{
    private const COLUMNS = 'LOWER(HEX(d.id)) AS id, d.name, d.created_at, d.updated_at, d.version, d.deleted_at, '
        . '(SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.deleted_at IS NULL) AS active_user_count';

    public function __construct(private readonly Connection $connection)
    {
    }

    public function find(string $id): ?DepartmentRecord
    {
        $row = $this->connection->fetchAssociative(
            'SELECT ' . self::COLUMNS . ' FROM departments d WHERE d.id = UNHEX(:id)',
            ['id' => Uuid::toHex($id)],
        );

        return $row === false ? null : $this->hydrate($row);
    }

    /**
     * Locks the department until the end of the transaction. Assigning a user takes a shared lock on it
     * (UserRepository::departmentIsActive), so nobody joins it while it is being deactivated.
     */
    public function lock(string $id): bool
    {
        return $this->connection->fetchOne(
            'SELECT 1 FROM departments WHERE id = UNHEX(:id) FOR UPDATE',
            ['id' => Uuid::toHex($id)],
        ) !== false;
    }

    /**
     * @param string $status active, inactive or all
     * @return array{records: list<DepartmentRecord>, total: int}
     */
    public function search(?string $text, string $status, Pagination $page): array
    {
        $filtered = function (QueryBuilder $query) use ($text, $status): QueryBuilder {
            if ($status === 'active') {
                $query->andWhere('d.deleted_at IS NULL');
            } elseif ($status === 'inactive') {
                $query->andWhere('d.deleted_at IS NOT NULL');
            }
            if ($text !== null && $text !== '') {
                $query->andWhere('d.name LIKE :text')->setParameter('text', '%' . addcslashes($text, '%_\\') . '%');
            }

            return $query;
        };

        $total = $filtered($this->connection->createQueryBuilder()->select('COUNT(*)')->from('departments', 'd'))
            ->executeQuery()
            ->fetchOne();
        $rows = $filtered($this->connection->createQueryBuilder()->select(self::COLUMNS)->from('departments', 'd'))
            ->orderBy('d.name')
            ->addOrderBy('d.id')
            ->setFirstResult($page->offset())
            ->setMaxResults($page->perPage)
            ->executeQuery()
            ->fetchAllAssociative();

        return [
            'records' => array_map($this->hydrate(...), $rows),
            'total' => is_numeric($total) ? (int) $total : 0,
        ];
    }

    public function insert(string $id, string $name, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'INSERT INTO departments (id, name, created_at, updated_at) VALUES (UNHEX(:id), :name, :now, :now)',
            ['id' => Uuid::toHex($id), 'name' => $name, 'now' => Timestamps::toDb($now)],
        );
    }

    /** @return bool false when the version is stale or the department does not exist */
    public function rename(string $id, int $version, string $name, DateTimeImmutable $now): bool
    {
        return $this->connection->executeStatement(
            'UPDATE departments SET name = :name, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id) AND version = :version',
            ['id' => Uuid::toHex($id), 'version' => $version, 'name' => $name, 'now' => Timestamps::toDb($now)],
        ) === 1;
    }

    /** Deactivates (a date) or reactivates (null). */
    public function setDeletedAt(string $id, ?DateTimeImmutable $deletedAt, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE departments SET deleted_at = :deleted_at, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id)',
            [
                'id' => Uuid::toHex($id),
                'deleted_at' => $deletedAt === null ? null : Timestamps::toDb($deletedAt),
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): DepartmentRecord
    {
        return new DepartmentRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            Row::string($row, 'name'),
            Row::int($row, 'active_user_count'),
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
            Row::nullableDate($row, 'deleted_at'),
        );
    }
}
