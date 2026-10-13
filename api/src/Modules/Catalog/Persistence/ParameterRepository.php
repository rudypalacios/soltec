<?php

declare(strict_types=1);

namespace Soltec\Modules\Catalog\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Query\QueryBuilder;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Catalog\Domain\ParameterDefinition;
use Soltec\Modules\Catalog\Domain\ParameterRecord;

/**
 * Reads and writes the tables of the catalog parameters. The table name comes from a ParameterDefinition (code, never
 * request data), so it is safe to put in the SQL. Ids cross the database as hex (see Uuid).
 */
final class ParameterRepository
{
    public function __construct(private readonly Connection $connection)
    {
    }

    public function find(ParameterDefinition $parameter, string $id): ?ParameterRecord
    {
        $row = $this->connection->fetchAssociative(
            'SELECT ' . $this->columns($parameter) . ' FROM ' . $parameter->table . ' p WHERE p.id = UNHEX(:id)',
            ['id' => Uuid::toHex($id)],
        );

        return $row === false ? null : $this->hydrate($parameter, $row);
    }

    /** Locks the row until the end of the transaction. */
    public function lock(ParameterDefinition $parameter, string $id): bool
    {
        return $this->connection->fetchOne(
            'SELECT 1 FROM ' . $parameter->table . ' WHERE id = UNHEX(:id) FOR UPDATE',
            ['id' => Uuid::toHex($id)],
        ) !== false;
    }

    /**
     * @param string $status active, inactive or all
     * @return array{records: list<ParameterRecord>, total: int}
     */
    public function search(ParameterDefinition $parameter, ?string $text, string $status, Pagination $page): array
    {
        $filtered = function (QueryBuilder $query) use ($text, $status): QueryBuilder {
            if ($status === 'active') {
                $query->andWhere('p.deleted_at IS NULL');
            } elseif ($status === 'inactive') {
                $query->andWhere('p.deleted_at IS NOT NULL');
            }
            if ($text !== null && $text !== '') {
                $query->andWhere('p.name LIKE :text')->setParameter('text', '%' . addcslashes($text, '%_\\') . '%');
            }

            return $query;
        };

        $total = $filtered(
            $this->connection->createQueryBuilder()->select('COUNT(*)')->from($parameter->table, 'p'),
        )->executeQuery()->fetchOne();
        $rows = $filtered(
            $this->connection->createQueryBuilder()->select($this->columns($parameter))->from($parameter->table, 'p'),
        )
            ->orderBy('p.name')
            ->addOrderBy('p.id')
            ->setFirstResult($page->offset())
            ->setMaxResults($page->perPage)
            ->executeQuery()
            ->fetchAllAssociative();

        return [
            'records' => array_map(fn (array $row): ParameterRecord => $this->hydrate($parameter, $row), $rows),
            'total' => is_numeric($total) ? (int) $total : 0,
        ];
    }

    public function insert(
        ParameterDefinition $parameter,
        string $id,
        string $name,
        ?string $color,
        DateTimeImmutable $now,
    ): void {
        $columns = $parameter->hasColor
            ? 'id, name, color, created_at, updated_at'
            : 'id, name, created_at, updated_at';
        $values = $parameter->hasColor ? 'UNHEX(:id), :name, :color, :now, :now' : 'UNHEX(:id), :name, :now, :now';
        $params = ['id' => Uuid::toHex($id), 'name' => $name, 'now' => Timestamps::toDb($now)];
        if ($parameter->hasColor) {
            $params['color'] = $color;
        }

        $this->connection->executeStatement(
            sprintf('INSERT INTO %s (%s) VALUES (%s)', $parameter->table, $columns, $values),
            $params,
        );
    }

    /** @return bool false when the version is stale or the row does not exist */
    public function update(
        ParameterDefinition $parameter,
        string $id,
        int $version,
        string $name,
        ?string $color,
        DateTimeImmutable $now,
    ): bool {
        $set = $parameter->hasColor ? 'name = :name, color = :color' : 'name = :name';
        $params = ['id' => Uuid::toHex($id), 'version' => $version, 'name' => $name, 'now' => Timestamps::toDb($now)];
        if ($parameter->hasColor) {
            $params['color'] = $color;
        }

        return $this->connection->executeStatement(
            sprintf(
                'UPDATE %s SET %s, updated_at = :now, version = version + 1 '
                . 'WHERE id = UNHEX(:id) AND version = :version',
                $parameter->table,
                $set,
            ),
            $params,
        ) === 1;
    }

    /** Deactivates (a date) or reactivates (null). */
    public function setDeletedAt(
        ParameterDefinition $parameter,
        string $id,
        ?DateTimeImmutable $deletedAt,
        DateTimeImmutable $now,
    ): void {
        $this->connection->executeStatement(
            sprintf(
                'UPDATE %s SET deleted_at = :deleted_at, updated_at = :now, version = version + 1 '
                . 'WHERE id = UNHEX(:id)',
                $parameter->table,
            ),
            [
                'id' => Uuid::toHex($id),
                'deleted_at' => $deletedAt === null ? null : Timestamps::toDb($deletedAt),
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    private function columns(ParameterDefinition $parameter): string
    {
        return 'LOWER(HEX(p.id)) AS id, p.name, p.created_at, p.updated_at, p.version, p.deleted_at'
            . ($parameter->hasColor ? ', p.color' : '');
    }

    /** @param array<string, mixed> $row */
    private function hydrate(ParameterDefinition $parameter, array $row): ParameterRecord
    {
        return new ParameterRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            Row::string($row, 'name'),
            $parameter->hasColor ? Row::string($row, 'color') : null,
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
            Row::nullableDate($row, 'deleted_at'),
        );
    }
}
