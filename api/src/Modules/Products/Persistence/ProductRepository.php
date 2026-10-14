<?php

declare(strict_types=1);

namespace Soltec\Modules\Products\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Query\QueryBuilder;
use LogicException;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Products\Domain\ProductData;
use Soltec\Modules\Products\Domain\ProductFilters;
use Soltec\Modules\Products\Domain\ProductRecord;

/**
 * Reads and writes `products` with the names of the supplier, group, area, brand and unit they point at. Products
 * have no owner and no data scope. Ids cross the database as hex (see Uuid).
 */
final class ProductRepository
{
    /** The tables a product points at, for {@see isActive()}. */
    private const REFERENCED = ['suppliers', 'product_groups', 'brands', 'units_of_measure'];

    private const COLUMNS = 'LOWER(HEX(p.id)) AS id, p.code, p.name, p.description, '
        . 'LOWER(HEX(p.supplier_id)) AS supplier_id, s.name AS supplier_name, '
        . 'LOWER(HEX(p.group_id)) AS group_id, g.name AS group_name, '
        . 'LOWER(HEX(g.area_id)) AS area_id, a.name AS area_name, '
        . 'LOWER(HEX(p.brand_id)) AS brand_id, b.name AS brand_name, '
        . 'LOWER(HEX(p.unit_id)) AS unit_id, u.name AS unit_name, '
        . 'p.cost, p.cost_updated_at, p.check_availability, p.deactivation_reason, '
        . 'p.created_at, p.updated_at, p.version, p.deleted_at';

    public function __construct(private readonly Connection $connection)
    {
    }

    public function find(string $id): ?ProductRecord
    {
        $row = $this->base(self::COLUMNS)
            ->andWhere('p.id = UNHEX(:id)')
            ->setParameter('id', Uuid::toHex($id))
            ->executeQuery()
            ->fetchAssociative();

        return $row === false ? null : $this->hydrate($row);
    }

    /** Locks the row until the end of the transaction. */
    public function lock(string $id): bool
    {
        return $this->connection->fetchOne(
            'SELECT 1 FROM products WHERE id = UNHEX(:id) FOR UPDATE',
            ['id' => Uuid::toHex($id)],
        ) !== false;
    }

    /**
     * @return array{records: list<ProductRecord>, total: int}
     */
    public function search(ProductFilters $filters, DateTimeImmutable $staleBefore, Pagination $page): array
    {
        $filtered = function (QueryBuilder $query) use ($filters, $staleBefore): QueryBuilder {
            if ($filters->status === 'active') {
                $query->andWhere('p.deleted_at IS NULL');
            } elseif ($filters->status === 'inactive') {
                $query->andWhere('p.deleted_at IS NOT NULL');
            }
            foreach (
                [
                'supplier' => ['p.supplier_id', $filters->supplierId],
                'area' => ['g.area_id', $filters->areaId],
                'group' => ['p.group_id', $filters->groupId],
                'brand' => ['p.brand_id', $filters->brandId],
                ] as $name => [$column, $value]
            ) {
                if ($value !== null) {
                    $query->andWhere($column . ' = UNHEX(:' . $name . ')')->setParameter($name, Uuid::toHex($value));
                }
            }
            if ($filters->staleOnly) {
                $query->andWhere('p.cost_updated_at < :stale_before')
                    ->setParameter('stale_before', Timestamps::toDb($staleBefore));
            }
            if ($filters->text !== null && $filters->text !== '') {
                $query->andWhere('(p.name LIKE :text OR p.code LIKE :text)')
                    ->setParameter('text', '%' . addcslashes($filters->text, '%_\\') . '%');
            }

            return $query;
        };

        $total = $filtered($this->base('COUNT(*)'))->executeQuery()->fetchOne();
        $rows = $filtered($this->base(self::COLUMNS))
            ->orderBy('p.name')
            ->addOrderBy('p.id')
            ->setFirstResult($page->offset())
            ->setMaxResults($page->perPage)
            ->executeQuery()
            ->fetchAllAssociative();

        return [
            'records' => array_map($this->hydrate(...), $rows),
            'total' => is_numeric($total) ? (int) $total : 0,
        ];
    }

    public function insert(string $id, string $code, ProductData $data, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'INSERT INTO products (id, code, name, description, supplier_id, group_id, brand_id, unit_id, cost, '
            . 'cost_updated_at, check_availability, created_at, updated_at) VALUES (UNHEX(:id), :code, :name, '
            . ':description, UNHEX(:supplier), UNHEX(:group), UNHEX(:brand), UNHEX(:unit), :cost, :now, '
            . ':check_availability, :now, :now)',
            [
                'id' => Uuid::toHex($id),
                'code' => $code,
                'now' => Timestamps::toDb($now),
            ] + $this->columns($data),
        );
    }

    /**
     * @param bool $costMoment whether the cost counts as updated now (it changed, or somebody confirmed it)
     * @return bool false when the version is stale or the product does not exist
     */
    public function update(string $id, int $version, ProductData $data, bool $costMoment, DateTimeImmutable $now): bool
    {
        return $this->connection->executeStatement(
            'UPDATE products SET name = :name, description = :description, supplier_id = UNHEX(:supplier), '
            . 'group_id = UNHEX(:group), brand_id = UNHEX(:brand), unit_id = UNHEX(:unit), cost = :cost, '
            . 'check_availability = :check_availability, '
            . ($costMoment ? 'cost_updated_at = :now, ' : '')
            . 'updated_at = :now, version = version + 1 WHERE id = UNHEX(:id) AND version = :version',
            [
                'id' => Uuid::toHex($id),
                'version' => $version,
                'now' => Timestamps::toDb($now),
            ] + $this->columns($data),
        ) === 1;
    }

    /**
     * What the bulk actions need to decide per product, with the rows locked in id order so two bulk changes never
     * wait on each other in opposite orders.
     *
     * @param list<string> $ids
     * @return array<string, array{
     *     active: bool, reason: string|null, supplier_active: bool, cost_updated_at: DateTimeImmutable
     * }> by id; missing ids are not in it
     */
    public function lockedStates(array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        [$in, $params] = $this->inList($ids);
        $rows = $this->connection->fetchAllAssociative(
            'SELECT LOWER(HEX(p.id)) AS id, p.deleted_at, p.deactivation_reason, p.cost_updated_at, '
            . 's.deleted_at AS supplier_deleted_at '
            . 'FROM products p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id IN (' . $in . ') '
            . 'ORDER BY p.id FOR UPDATE',
            $params,
        );

        $states = [];
        foreach ($rows as $row) {
            $states[Uuid::fromHex(Row::string($row, 'id'))] = [
                'active' => ($row['deleted_at'] ?? null) === null,
                'reason' => Row::nullableString($row, 'deactivation_reason'),
                'supplier_active' => ($row['supplier_deleted_at'] ?? null) === null,
                'cost_updated_at' => Row::date($row, 'cost_updated_at'),
            ];
        }

        return $states;
    }

    /**
     * Deactivates (a date and a reason) or reactivates (null) the given products, and bumps their version.
     *
     * @param list<string> $ids
     */
    public function setDeletedAtMany(
        array $ids,
        ?DateTimeImmutable $deletedAt,
        ?string $reason,
        DateTimeImmutable $now,
    ): void {
        foreach (array_chunk($ids, 200) as $chunk) {
            [$in, $params] = $this->inList($chunk);
            $this->connection->executeStatement(
                'UPDATE products SET deleted_at = :deleted_at, deactivation_reason = :reason, updated_at = :now, '
                . 'version = version + 1 WHERE id IN (' . $in . ')',
                $params + [
                    'deleted_at' => $deletedAt === null ? null : Timestamps::toDb($deletedAt),
                    'reason' => $deletedAt === null ? null : $reason,
                    'now' => Timestamps::toDb($now),
                ],
            );
        }
    }

    /**
     * Says the cost of these products was confirmed now, without changing it.
     *
     * @param list<string> $ids
     */
    public function confirmCostMany(array $ids, DateTimeImmutable $now): void
    {
        foreach (array_chunk($ids, 200) as $chunk) {
            [$in, $params] = $this->inList($chunk);
            $this->connection->executeStatement(
                'UPDATE products SET cost_updated_at = :now, updated_at = :now, version = version + 1 '
                . 'WHERE id IN (' . $in . ')',
                $params + ['now' => Timestamps::toDb($now)],
            );
        }
    }

    /**
     * The ids of the active products of a supplier, locked, for the cascade of its deactivation.
     *
     * @return list<string>
     */
    public function lockActiveOfSupplier(string $supplierId): array
    {
        return $this->ids(
            'SELECT LOWER(HEX(id)) FROM products WHERE supplier_id = UNHEX(:supplier) AND deleted_at IS NULL '
            . 'ORDER BY id FOR UPDATE',
            $supplierId,
        );
    }

    /**
     * The ids of the products a supplier took down with it, locked, to reactivate them together.
     *
     * @return list<string>
     */
    public function lockInactiveBySupplier(string $supplierId): array
    {
        return $this->ids(
            'SELECT LOWER(HEX(id)) FROM products WHERE supplier_id = UNHEX(:supplier) AND deleted_at IS NOT NULL '
            . "AND deactivation_reason = 'supplier' ORDER BY id FOR UPDATE",
            $supplierId,
        );
    }

    public function countInactiveBySupplier(string $supplierId): int
    {
        $count = $this->connection->fetchOne(
            'SELECT COUNT(*) FROM products WHERE supplier_id = UNHEX(:supplier) AND deleted_at IS NOT NULL '
            . "AND deactivation_reason = 'supplier'",
            ['supplier' => Uuid::toHex($supplierId)],
        );

        return is_numeric($count) ? (int) $count : 0;
    }

    /**
     * Whether a row of a table a product points at exists and is active. With `$lock` the row is locked, so the
     * cascade of a supplier waits for the product being saved (and the other way round), ADR-0023.
     */
    public function isActive(string $table, string $id, bool $lock): bool
    {
        if (!in_array($table, self::REFERENCED, true)) {
            throw new LogicException(sprintf('"%s" is not a table a product points at.', $table));
        }

        return $this->connection->fetchOne(
            sprintf(
                'SELECT 1 FROM %s WHERE id = UNHEX(:id) AND deleted_at IS NULL%s',
                $table,
                $lock ? ' FOR UPDATE' : '',
            ),
            ['id' => Uuid::toHex($id)],
        ) !== false;
    }

    /** @return array<string, string|int|null> the bound columns shared by insert and update */
    private function columns(ProductData $data): array
    {
        return [
            'name' => $data->name,
            'description' => $data->description,
            'supplier' => Uuid::toHex($data->supplierId),
            'group' => Uuid::toHex($data->groupId),
            'brand' => $data->brandId === null ? null : Uuid::toHex($data->brandId),
            'unit' => Uuid::toHex($data->unitId),
            'cost' => $data->cost,
            'check_availability' => $data->checkAvailability ? 1 : 0,
        ];
    }

    /** @return list<string> */
    private function ids(string $sql, string $supplierId): array
    {
        $ids = [];
        foreach ($this->connection->fetchFirstColumn($sql, ['supplier' => Uuid::toHex($supplierId)]) as $hex) {
            $ids[] = Uuid::fromHex(Row::scalarString($hex));
        }

        return $ids;
    }

    /**
     * @param list<string> $ids
     * @return array{0: string, 1: array<string, string>} the placeholders of an IN list and their values
     */
    private function inList(array $ids): array
    {
        $placeholders = [];
        $params = [];
        foreach ($ids as $index => $id) {
            $placeholders[] = sprintf('UNHEX(:id_%d)', $index);
            $params['id_' . $index] = Uuid::toHex($id);
        }

        return [implode(', ', $placeholders), $params];
    }

    private function base(string $select): QueryBuilder
    {
        return $this->connection->createQueryBuilder()
            ->select($select)
            ->from('products', 'p')
            ->innerJoin('p', 'suppliers', 's', 's.id = p.supplier_id')
            ->innerJoin('p', 'product_groups', 'g', 'g.id = p.group_id')
            ->innerJoin('g', 'areas', 'a', 'a.id = g.area_id')
            ->leftJoin('p', 'brands', 'b', 'b.id = p.brand_id')
            ->innerJoin('p', 'units_of_measure', 'u', 'u.id = p.unit_id');
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): ProductRecord
    {
        $brandId = Row::nullableString($row, 'brand_id');
        $reason = Row::nullableString($row, 'deactivation_reason');

        return new ProductRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            Row::string($row, 'code'),
            new ProductData(
                Row::string($row, 'name'),
                Row::nullableString($row, 'description'),
                Uuid::fromHex(Row::string($row, 'supplier_id')),
                Uuid::fromHex(Row::string($row, 'group_id')),
                $brandId === null ? null : Uuid::fromHex($brandId),
                Uuid::fromHex(Row::string($row, 'unit_id')),
                Row::string($row, 'cost'),
                Row::bool($row, 'check_availability'),
            ),
            ['id' => Uuid::fromHex(Row::string($row, 'supplier_id')), 'name' => Row::string($row, 'supplier_name')],
            ['id' => Uuid::fromHex(Row::string($row, 'group_id')), 'name' => Row::string($row, 'group_name')],
            ['id' => Uuid::fromHex(Row::string($row, 'area_id')), 'name' => Row::string($row, 'area_name')],
            $brandId === null ? null : ['id' => Uuid::fromHex($brandId), 'name' => Row::string($row, 'brand_name')],
            ['id' => Uuid::fromHex(Row::string($row, 'unit_id')), 'name' => Row::string($row, 'unit_name')],
            Row::date($row, 'cost_updated_at'),
            $reason,
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
            Row::nullableDate($row, 'deleted_at'),
        );
    }
}
