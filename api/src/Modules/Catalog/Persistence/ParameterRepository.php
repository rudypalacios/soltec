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
 * Reads and writes the tables of the catalog lists. Table and column names come from a ParameterDefinition (code,
 * never request data), so they are safe to put in the SQL. Ids cross the database as hex (see Uuid).
 */
final class ParameterRepository
{
    public function __construct(private readonly Connection $connection)
    {
    }

    public function find(ParameterDefinition $parameter, string $id): ?ParameterRecord
    {
        $row = $this->from($parameter, $this->connection->createQueryBuilder()->select($this->columns($parameter)))
            ->where('p.id = UNHEX(:id)')
            ->setParameter('id', Uuid::toHex($id))
            ->executeQuery()
            ->fetchAssociative();

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
     * Takes a shared lock on the parent of a list, so it cannot be deactivated while a value is being added under it.
     * Deactivating takes the exclusive lock (see lock()), so the two never overlap.
     *
     * @return bool|null whether the parent is active, or null when it does not exist
     */
    public function lockParent(ParameterDefinition $parameter, string $parentId): ?bool
    {
        $link = $parameter->parent;
        if ($link === null) {
            return null;
        }
        $row = $this->connection->fetchAssociative(
            'SELECT deleted_at FROM ' . $link->table . ' WHERE id = UNHEX(:id) LOCK IN SHARE MODE',
            ['id' => Uuid::toHex($parentId)],
        );

        return $row === false ? null : $row['deleted_at'] === null;
    }

    /**
     * @param string $status active, inactive or all
     * @param string|null $parentId only the values under this parent (lists that have one)
     * @return array{records: list<ParameterRecord>, total: int}
     */
    public function search(
        ParameterDefinition $parameter,
        ?string $text,
        string $status,
        ?string $parentId,
        Pagination $page,
    ): array {
        $filtered = function (QueryBuilder $query) use ($parameter, $text, $status, $parentId): QueryBuilder {
            if ($status === 'active') {
                $query->andWhere('p.deleted_at IS NULL');
            } elseif ($status === 'inactive') {
                $query->andWhere('p.deleted_at IS NOT NULL');
            }
            if ($text !== null && $text !== '') {
                $query->andWhere('p.name LIKE :text')->setParameter('text', '%' . addcslashes($text, '%_\\') . '%');
            }
            if ($parentId !== null && $parameter->parent !== null) {
                $query->andWhere('p.' . $parameter->parent->column . ' = UNHEX(:parent)')
                    ->setParameter('parent', Uuid::toHex($parentId));
            }

            return $query;
        };

        $total = $filtered($this->from($parameter, $this->connection->createQueryBuilder()->select('COUNT(*)')))
            ->executeQuery()
            ->fetchOne();
        $rows = $filtered($this->from($parameter, $this->connection->createQueryBuilder()->select(
            $this->columns($parameter),
        )))
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

    /**
     * The active values with only what a form needs to choose one: id and name, by name, and the id of the parent for a
     * value that belongs to one (the area of a group, the category of a unit), so the form can narrow its choices. A
     * form never needs more than a few hundred, so there is no paging.
     *
     * @return list<array<string, string>>
     */
    public function options(ParameterDefinition $parameter, int $limit): array
    {
        $parentColumn = $parameter->parent?->column;
        $select = 'LOWER(HEX(p.id)) AS id, p.name';
        if ($parentColumn !== null) {
            $select .= ', LOWER(HEX(p.' . $parentColumn . ')) AS parent_id';
        }
        $rows = $this->connection->createQueryBuilder()
            ->select($select)
            ->from($parameter->table, 'p')
            ->where('p.deleted_at IS NULL')
            ->orderBy('p.name')
            ->addOrderBy('p.id')
            ->setMaxResults($limit)
            ->executeQuery()
            ->fetchAllAssociative();

        $options = [];
        foreach ($rows as $row) {
            $option = ['id' => Uuid::fromHex(Row::string($row, 'id')), 'name' => Row::string($row, 'name')];
            if ($parentColumn !== null) {
                $option[$parentColumn] = Uuid::fromHex(Row::string($row, 'parent_id'));
            }
            $options[] = $option;
        }

        return $options;
    }

    public function insert(
        ParameterDefinition $parameter,
        string $id,
        string $name,
        ?string $color,
        ?string $parentId,
        DateTimeImmutable $now,
    ): void {
        $values = ['id' => 'UNHEX(:id)', 'name' => ':name'];
        $params = ['id' => Uuid::toHex($id), 'name' => $name, 'now' => Timestamps::toDb($now)];
        if ($parameter->hasColor) {
            $values['color'] = ':color';
            $params['color'] = $color;
        }
        if ($parameter->parent !== null) {
            $values[$parameter->parent->column] = 'UNHEX(:parent)';
            $params['parent'] = $parentId === null ? null : Uuid::toHex($parentId);
        }
        $values['created_at'] = ':now';
        $values['updated_at'] = ':now';

        $this->connection->executeStatement(
            sprintf(
                'INSERT INTO %s (%s) VALUES (%s)',
                $parameter->table,
                implode(', ', array_keys($values)),
                implode(', ', $values),
            ),
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
        ?string $parentId,
        DateTimeImmutable $now,
    ): bool {
        $set = ['name = :name'];
        $params = ['id' => Uuid::toHex($id), 'version' => $version, 'name' => $name, 'now' => Timestamps::toDb($now)];
        if ($parameter->hasColor) {
            $set[] = 'color = :color';
            $params['color'] = $color;
        }
        if ($parameter->parent !== null) {
            $set[] = $parameter->parent->column . ' = UNHEX(:parent)';
            $params['parent'] = $parentId === null ? null : Uuid::toHex($parentId);
        }

        return $this->connection->executeStatement(
            sprintf(
                'UPDATE %s SET %s, updated_at = :now, version = version + 1 '
                . 'WHERE id = UNHEX(:id) AND version = :version',
                $parameter->table,
                implode(', ', $set),
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

    /** `FROM <table> p`, joined to the parent when the list has one. */
    private function from(ParameterDefinition $parameter, QueryBuilder $query): QueryBuilder
    {
        $query->from($parameter->table, 'p');
        if ($parameter->parent !== null) {
            $query->innerJoin(
                'p',
                $parameter->parent->table,
                'parent',
                'parent.id = p.' . $parameter->parent->column,
            );
        }

        return $query;
    }

    private function columns(ParameterDefinition $parameter): string
    {
        $columns = 'LOWER(HEX(p.id)) AS id, p.name, p.created_at, p.updated_at, p.version, p.deleted_at';
        if ($parameter->hasColor) {
            $columns .= ', p.color';
        }
        if ($parameter->parent !== null) {
            $columns .= sprintf(
                ', LOWER(HEX(p.%s)) AS parent_id, parent.name AS parent_name',
                $parameter->parent->column,
            );
        }
        if ($parameter->children !== null) {
            $child = $parameter->children;
            $columns .= sprintf(
                ', (SELECT COUNT(*) FROM %s c WHERE c.%s = p.id AND c.deleted_at IS NULL) AS child_count',
                $child->table,
                $child->column,
            );
        }

        return $columns;
    }

    /** @param array<string, mixed> $row */
    private function hydrate(ParameterDefinition $parameter, array $row): ParameterRecord
    {
        $extra = [];
        $parentId = null;
        if ($parameter->parent !== null) {
            $parentId = Uuid::fromHex(Row::string($row, 'parent_id'));
            $extra[$parameter->parent->key] = ['id' => $parentId, 'name' => Row::string($row, 'parent_name')];
        }
        if ($parameter->children !== null) {
            $extra[$parameter->children->countField] = Row::int($row, 'child_count');
        }

        return new ParameterRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            Row::string($row, 'name'),
            $parameter->hasColor ? Row::string($row, 'color') : null,
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
            Row::nullableDate($row, 'deleted_at'),
            $parentId,
            $extra,
        );
    }
}
