<?php

declare(strict_types=1);

namespace Soltec\Modules\Products\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Query\QueryBuilder;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Products\Domain\BundleComponent;
use Soltec\Modules\Products\Domain\BundleData;
use Soltec\Modules\Products\Domain\BundleItemData;
use Soltec\Modules\Products\Domain\BundleRecord;
use Soltec\Modules\Products\Domain\ProductFilters;
use Soltec\Modules\Products\Domain\ProductOrder;

/**
 * Reads and writes `bundles` and their components. Bundles have no owner and no data scope. Ids cross the database
 * as hex (see Uuid). What the components add up to is computed in the query, never stored.
 */
final class BundleRepository
{
    /**
     * Per bundle: the cost its components add up to (rounded once, to four decimals), the age of the oldest one, how
     * many there are, how many are inactive and whether any checks availability.
     */
    private const AGGREGATE = 'SELECT bi.bundle_id, ROUND(SUM(bi.quantity * p.cost), 4) AS cost, '
        . 'MIN(p.cost_updated_at) AS cost_updated_at, COUNT(*) AS component_count, '
        . 'SUM(p.deleted_at IS NOT NULL) AS inactive_count, MAX(p.check_availability) AS check_availability '
        . 'FROM bundle_items bi INNER JOIN products p ON p.id = bi.product_id GROUP BY bi.bundle_id';

    private const COLUMNS = 'LOWER(HEX(b.id)) AS id, b.code, b.name, b.description, '
        . 'LOWER(HEX(b.group_id)) AS group_id, g.name AS group_name, '
        . 'LOWER(HEX(g.area_id)) AS area_id, a.name AS area_name, '
        . 'LOWER(HEX(b.brand_id)) AS brand_id, br.name AS brand_name, '
        . 'agg.cost, agg.cost_updated_at, agg.component_count, agg.inactive_count, agg.check_availability, '
        . 'b.created_at, b.updated_at, b.version, b.deleted_at';

    public function __construct(private readonly Connection $connection)
    {
    }

    /** The bundle with its components. */
    public function find(string $id): ?BundleRecord
    {
        $row = $this->base(self::COLUMNS)
            ->andWhere('b.id = UNHEX(:id)')
            ->setParameter('id', Uuid::toHex($id))
            ->executeQuery()
            ->fetchAssociative();
        if ($row === false) {
            return null;
        }
        $items = $this->components($id);

        return $this->hydrate($row, $this->suppliersOf($items), $items);
    }

    /** Locks the row until the end of the transaction. */
    public function lock(string $id): bool
    {
        return $this->connection->fetchOne(
            'SELECT 1 FROM bundles WHERE id = UNHEX(:id) FOR UPDATE',
            ['id' => Uuid::toHex($id)],
        ) !== false;
    }

    /**
     * The product ids of the components a bundle has now.
     *
     * @return list<string>
     */
    public function productIdsOf(string $id): array
    {
        $ids = [];
        foreach (
            $this->connection->fetchFirstColumn(
                'SELECT LOWER(HEX(product_id)) FROM bundle_items WHERE bundle_id = UNHEX(:id)',
                ['id' => Uuid::toHex($id)],
            ) as $hex
        ) {
            $ids[] = Uuid::fromHex(Row::scalarString($hex));
        }

        return $ids;
    }

    /**
     * @return array{records: list<BundleRecord>, total: int}
     */
    public function search(
        ProductFilters $filters,
        ProductOrder $order,
        DateTimeImmutable $staleBefore,
        Pagination $page,
    ): array {
        $filtered = function (QueryBuilder $query) use ($filters, $staleBefore): QueryBuilder {
            if ($filters->status === 'active') {
                $query->andWhere('b.deleted_at IS NULL');
            } elseif ($filters->status === 'inactive') {
                $query->andWhere('b.deleted_at IS NOT NULL');
            }
            foreach (
                [
                    'area' => ['g.area_id', $filters->areaId],
                    'group' => ['b.group_id', $filters->groupId],
                    'brand' => ['b.brand_id', $filters->brandId],
                ] as $name => [$column, $value]
            ) {
                if ($value !== null) {
                    $query->andWhere($column . ' = UNHEX(:' . $name . ')')->setParameter($name, Uuid::toHex($value));
                }
            }
            if ($filters->supplierId !== null) {
                $query->andWhere(
                    'EXISTS (SELECT 1 FROM bundle_items bs INNER JOIN products ps ON ps.id = bs.product_id '
                    . 'WHERE bs.bundle_id = b.id AND ps.supplier_id = UNHEX(:supplier))',
                )->setParameter('supplier', Uuid::toHex($filters->supplierId));
            }
            if ($filters->staleOnly) {
                $query->andWhere('agg.cost_updated_at < :stale_before')
                    ->setParameter('stale_before', Timestamps::toDb($staleBefore));
            }
            if ($filters->text !== null && $filters->text !== '') {
                // The bundle by its own name or code, or by what it contains.
                $query->andWhere(
                    '(b.name LIKE :text OR b.code LIKE :text OR EXISTS ('
                    . 'SELECT 1 FROM bundle_items bt INNER JOIN products pt ON pt.id = bt.product_id '
                    . 'WHERE bt.bundle_id = b.id AND (pt.name LIKE :text OR pt.code LIKE :text)))',
                )->setParameter('text', '%' . addcslashes($filters->text, '%_\\') . '%');
            }

            return $query;
        };

        $total = $filtered($this->base('COUNT(*)'))->executeQuery()->fetchOne();
        $rows = $this->ordered($filtered($this->base(self::COLUMNS)), $order)
            ->setFirstResult($page->offset())
            ->setMaxResults($page->perPage)
            ->executeQuery()
            ->fetchAllAssociative();

        $ids = array_map(static fn (array $row): string => Uuid::fromHex(Row::string($row, 'id')), $rows);
        $suppliers = $this->suppliersByBundle($ids);
        $matches = $this->matchesByBundle($ids, $filters->text);
        $records = [];
        foreach ($rows as $row) {
            $id = Uuid::fromHex(Row::string($row, 'id'));
            $records[] = $this->hydrate($row, $suppliers[$id] ?? [], null)
                ->withMatchedComponent($this->matchOutsideTheBundle($row, $matches[$id] ?? null, $filters->text));
        }

        return ['records' => $records, 'total' => is_numeric($total) ? (int) $total : 0];
    }

    public function insert(string $id, string $code, BundleData $data, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'INSERT INTO bundles (id, code, name, description, group_id, brand_id, created_at, updated_at) '
            . 'VALUES (UNHEX(:id), :code, :name, :description, UNHEX(:group), UNHEX(:brand), :now, :now)',
            [
                'id' => Uuid::toHex($id),
                'code' => $code,
                'now' => Timestamps::toDb($now),
            ] + $this->columns($data),
        );
        $this->replaceItems($id, $data->items);
    }

    /**
     * Replaces the data and the components of the bundle.
     *
     * @return bool false when the version is stale or the bundle does not exist
     */
    public function update(string $id, int $version, BundleData $data, DateTimeImmutable $now): bool
    {
        $changed = $this->connection->executeStatement(
            'UPDATE bundles SET name = :name, description = :description, group_id = UNHEX(:group), '
            . 'brand_id = UNHEX(:brand), updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id) AND version = :version',
            [
                'id' => Uuid::toHex($id),
                'version' => $version,
                'now' => Timestamps::toDb($now),
            ] + $this->columns($data),
        ) === 1;
        if ($changed) {
            $this->replaceItems($id, $data->items);
        }

        return $changed;
    }

    /** Deactivates (a date) or reactivates (null) the bundle and bumps its version. */
    public function setDeletedAt(string $id, ?DateTimeImmutable $deletedAt, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE bundles SET deleted_at = :deleted_at, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id)',
            [
                'id' => Uuid::toHex($id),
                'deleted_at' => $deletedAt === null ? null : Timestamps::toDb($deletedAt),
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /**
     * What the bulk actions need to decide per bundle, with the rows locked in id order so two bulk changes never wait
     * on each other in opposite orders.
     *
     * @param list<string> $ids
     * @return array<string, array{active: bool, group_active: bool}> by id; missing ids are not in it
     */
    public function lockedStates(array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        [$in, $params] = $this->inList($ids);
        $rows = $this->connection->fetchAllAssociative(
            'SELECT LOWER(HEX(b.id)) AS id, b.deleted_at, g.deleted_at AS group_deleted_at '
            . 'FROM bundles b JOIN product_groups g ON g.id = b.group_id WHERE b.id IN (' . $in . ') '
            . 'ORDER BY b.id FOR UPDATE',
            $params,
        );

        $states = [];
        foreach ($rows as $row) {
            $states[Uuid::fromHex(Row::string($row, 'id'))] = [
                'active' => ($row['deleted_at'] ?? null) === null,
                'group_active' => ($row['group_deleted_at'] ?? null) === null,
            ];
        }

        return $states;
    }

    /**
     * Deactivates (a date) or reactivates (null) the given bundles and bumps their version.
     *
     * @param list<string> $ids
     */
    public function setDeletedAtMany(array $ids, ?DateTimeImmutable $deletedAt, DateTimeImmutable $now): void
    {
        foreach (array_chunk($ids, 200) as $chunk) {
            [$in, $params] = $this->inList($chunk);
            $this->connection->executeStatement(
                'UPDATE bundles SET deleted_at = :deleted_at, updated_at = :now, version = version + 1 '
                . 'WHERE id IN (' . $in . ')',
                $params + [
                    'deleted_at' => $deletedAt === null ? null : Timestamps::toDb($deletedAt),
                    'now' => Timestamps::toDb($now),
                ],
            );
        }
    }

    /** Whether the row of a table the bundle points at exists and is active; the locked read is for a save. */
    public function isActive(string $table, string $id): bool
    {
        if (!in_array($table, ['product_groups', 'brands', 'products'], true)) {
            throw new \LogicException(sprintf('"%s" is not a table a bundle points at.', $table));
        }

        return $this->connection->fetchOne(
            sprintf('SELECT 1 FROM %s WHERE id = UNHEX(:id) AND deleted_at IS NULL', $table),
            ['id' => Uuid::toHex($id)],
        ) !== false;
    }

    /** Whether the bundle is active, or null when it does not exist. */
    public function isBundleActive(string $id): ?bool
    {
        $deletedAt = $this->connection->fetchAssociative(
            'SELECT deleted_at FROM bundles WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($id)],
        );

        return $deletedAt === false ? null : $deletedAt['deleted_at'] === null;
    }

    /**
     * Active products to choose a component among, by name or code, leaving out the ones given. With their cost: who
     * may see bundles sees the costs they add up (the section is for those who sell).
     *
     * @param list<string> $excluded product ids already in the bundle
     * @return list<array{id: string, code: string, name: string, cost: string, unit: array{id: string, name: string}}>
     */
    public function candidates(?string $text, array $excluded, int $limit): array
    {
        $query = $this->connection->createQueryBuilder()
            ->select(
                'LOWER(HEX(p.id)) AS id, p.code, p.name, p.cost, LOWER(HEX(p.unit_id)) AS unit_id, '
                . 'u.name AS unit_name',
            )
            ->from('products', 'p')
            ->innerJoin('p', 'units_of_measure', 'u', 'u.id = p.unit_id')
            ->where('p.deleted_at IS NULL')
            ->orderBy('p.name')
            ->addOrderBy('p.id')
            ->setMaxResults($limit);
        if ($text !== null && $text !== '') {
            $query->andWhere('(p.name LIKE :text OR p.code LIKE :text)')
                ->setParameter('text', '%' . addcslashes($text, '%_\\') . '%');
        }
        foreach ($excluded as $index => $id) {
            $query->andWhere('p.id <> UNHEX(:out_' . $index . ')')->setParameter('out_' . $index, Uuid::toHex($id));
        }

        $candidates = [];
        foreach ($query->executeQuery()->fetchAllAssociative() as $row) {
            $candidates[] = [
                'id' => Uuid::fromHex(Row::string($row, 'id')),
                'code' => Row::string($row, 'code'),
                'name' => Row::string($row, 'name'),
                'cost' => Row::string($row, 'cost'),
                'unit' => [
                    'id' => Uuid::fromHex(Row::string($row, 'unit_id')),
                    'name' => Row::string($row, 'unit_name'),
                ],
            ];
        }

        return $candidates;
    }

    /** @param list<BundleItemData> $items */
    private function replaceItems(string $id, array $items): void
    {
        $this->connection->executeStatement(
            'DELETE FROM bundle_items WHERE bundle_id = UNHEX(:id)',
            ['id' => Uuid::toHex($id)],
        );
        foreach ($items as $position => $item) {
            $this->connection->executeStatement(
                'INSERT INTO bundle_items (bundle_id, product_id, sort_order, quantity) '
                . 'VALUES (UNHEX(:bundle), UNHEX(:product), :position, :quantity)',
                [
                    'bundle' => Uuid::toHex($id),
                    'product' => Uuid::toHex($item->productId),
                    'position' => $position,
                    'quantity' => $item->quantity,
                ],
            );
        }
    }

    /** @return list<BundleComponent> */
    private function components(string $id): array
    {
        $rows = $this->connection->fetchAllAssociative(
            'SELECT LOWER(HEX(p.id)) AS product_id, p.code, p.name, LOWER(HEX(p.unit_id)) AS unit_id, '
            . 'u.name AS unit_name, LOWER(HEX(p.supplier_id)) AS supplier_id, s.name AS supplier_name, '
            . 'bi.quantity, p.cost, ROUND(bi.quantity * p.cost, 4) AS line_cost, p.cost_updated_at, p.deleted_at '
            . 'FROM bundle_items bi INNER JOIN products p ON p.id = bi.product_id '
            . 'INNER JOIN units_of_measure u ON u.id = p.unit_id INNER JOIN suppliers s ON s.id = p.supplier_id '
            . 'WHERE bi.bundle_id = UNHEX(:id) ORDER BY bi.sort_order',
            ['id' => Uuid::toHex($id)],
        );

        return array_map(static fn (array $row): BundleComponent => new BundleComponent(
            Uuid::fromHex(Row::string($row, 'product_id')),
            Row::string($row, 'code'),
            Row::string($row, 'name'),
            ['id' => Uuid::fromHex(Row::string($row, 'unit_id')), 'name' => Row::string($row, 'unit_name')],
            ['id' => Uuid::fromHex(Row::string($row, 'supplier_id')), 'name' => Row::string($row, 'supplier_name')],
            Row::string($row, 'quantity'),
            Row::string($row, 'cost'),
            Row::string($row, 'line_cost'),
            Row::date($row, 'cost_updated_at'),
            ($row['deleted_at'] ?? null) === null,
        ), $rows);
    }

    /**
     * @param list<BundleComponent> $items
     * @return list<array{id: string, name: string}>
     */
    private function suppliersOf(array $items): array
    {
        $suppliers = [];
        foreach ($items as $item) {
            $suppliers[$item->supplier['id']] = $item->supplier;
        }
        $suppliers = array_values($suppliers);
        usort($suppliers, static fn (array $a, array $b): int => strcmp($a['name'], $b['name']));

        return $suppliers;
    }

    /**
     * The suppliers of the components of each bundle, by name.
     *
     * @param list<string> $ids
     * @return array<string, list<array{id: string, name: string}>>
     */
    private function suppliersByBundle(array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        [$in, $params] = $this->inList($ids);
        $rows = $this->connection->fetchAllAssociative(
            'SELECT DISTINCT LOWER(HEX(bi.bundle_id)) AS bundle_id, LOWER(HEX(s.id)) AS id, s.name '
            . 'FROM bundle_items bi INNER JOIN products p ON p.id = bi.product_id '
            . 'INNER JOIN suppliers s ON s.id = p.supplier_id WHERE bi.bundle_id IN (' . $in . ') '
            . 'ORDER BY s.name, id',
            $params,
        );

        $suppliers = [];
        foreach ($rows as $row) {
            $suppliers[Uuid::fromHex(Row::string($row, 'bundle_id'))][] = [
                'id' => Uuid::fromHex(Row::string($row, 'id')),
                'name' => Row::string($row, 'name'),
            ];
        }

        return $suppliers;
    }

    /**
     * The first component of each bundle whose name or code has the text searched.
     *
     * @param list<string> $ids
     * @return array<string, array{code: string, name: string}>
     */
    private function matchesByBundle(array $ids, ?string $text): array
    {
        if ($ids === [] || $text === null || $text === '') {
            return [];
        }
        [$in, $params] = $this->inList($ids);
        $rows = $this->connection->fetchAllAssociative(
            'SELECT LOWER(HEX(bi.bundle_id)) AS bundle_id, p.code, p.name '
            . 'FROM bundle_items bi INNER JOIN products p ON p.id = bi.product_id '
            . 'WHERE bi.bundle_id IN (' . $in . ') AND (p.name LIKE :text OR p.code LIKE :text) '
            . 'ORDER BY bi.sort_order',
            $params + ['text' => '%' . addcslashes($text, '%_\\') . '%'],
        );

        $matches = [];
        foreach ($rows as $row) {
            $id = Uuid::fromHex(Row::string($row, 'bundle_id'));
            $matches[$id] ??= ['code' => Row::string($row, 'code'), 'name' => Row::string($row, 'name')];
        }

        return $matches;
    }

    /**
     * The component to point at, only when the bundle does not match by itself: if its own name or code has the
     * text, there is nothing to explain.
     *
     * @param array<string, mixed> $row
     * @param array{code: string, name: string}|null $match
     * @return array{code: string, name: string}|null
     */
    private function matchOutsideTheBundle(array $row, ?array $match, ?string $text): ?array
    {
        if ($match === null || $text === null || $text === '') {
            return null;
        }
        $own = Row::string($row, 'name') . ' ' . Row::string($row, 'code');

        return mb_stripos($own, $text) === false ? $match : null;
    }

    private function ordered(QueryBuilder $query, ProductOrder $order): QueryBuilder
    {
        if ($order->grouped) {
            $query->addOrderBy('a.name')->addOrderBy('g.name');
        }
        match ($order->sort) {
            ProductOrder::CODE => $query->addOrderBy('b.code'),
            ProductOrder::COST => $query->addOrderBy('agg.cost')->addOrderBy('b.name'),
            ProductOrder::COST_REVIEW => $query->addOrderBy('agg.cost_updated_at')->addOrderBy('b.name'),
            default => $query->addOrderBy('b.name'),
        };

        return $query->addOrderBy('b.id');
    }

    /** @return array<string, string|null> the bound columns shared by insert and update */
    private function columns(BundleData $data): array
    {
        return [
            'name' => $data->name,
            'description' => $data->description,
            'group' => Uuid::toHex($data->groupId),
            'brand' => $data->brandId === null ? null : Uuid::toHex($data->brandId),
        ];
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
            ->from('bundles', 'b')
            ->innerJoin('b', 'product_groups', 'g', 'g.id = b.group_id')
            ->innerJoin('g', 'areas', 'a', 'a.id = g.area_id')
            ->leftJoin('b', 'brands', 'br', 'br.id = b.brand_id')
            ->innerJoin('b', '(' . self::AGGREGATE . ')', 'agg', 'agg.bundle_id = b.id');
    }

    /**
     * @param array<string, mixed> $row
     * @param list<array{id: string, name: string}> $suppliers
     * @param list<BundleComponent>|null $items
     */
    private function hydrate(array $row, array $suppliers, ?array $items): BundleRecord
    {
        $brandId = Row::nullableString($row, 'brand_id');

        return new BundleRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            Row::string($row, 'code'),
            Row::string($row, 'name'),
            Row::nullableString($row, 'description'),
            ['id' => Uuid::fromHex(Row::string($row, 'group_id')), 'name' => Row::string($row, 'group_name')],
            ['id' => Uuid::fromHex(Row::string($row, 'area_id')), 'name' => Row::string($row, 'area_name')],
            $brandId === null ? null : ['id' => Uuid::fromHex($brandId), 'name' => Row::string($row, 'brand_name')],
            $suppliers,
            Row::string($row, 'cost'),
            Row::date($row, 'cost_updated_at'),
            Row::int($row, 'component_count'),
            Row::int($row, 'inactive_count'),
            Row::int($row, 'check_availability') === 1,
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
            Row::nullableDate($row, 'deleted_at'),
            $items,
        );
    }
}
