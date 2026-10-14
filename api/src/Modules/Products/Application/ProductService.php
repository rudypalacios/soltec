<?php

declare(strict_types=1);

namespace Soltec\Modules\Products\Application;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Products\Domain\ProductData;
use Soltec\Modules\Products\Domain\ProductFilters;
use Soltec\Modules\Products\Domain\ProductOrder;
use Soltec\Modules\Products\Domain\ProductRecord;
use Soltec\Modules\Products\Domain\ProductView;
use Soltec\Modules\Products\Persistence\ProductRepository;
use Soltec\Modules\Settings\Application\PriceService;
use Soltec\Modules\Settings\Application\SequenceGenerator;
use Soltec\Modules\Settings\Domain\PriceBasis;

/**
 * Administration of products. They have no owner or data scope; the permissions of the resource are the only gate.
 *
 * Three rules shape it:
 *  - No price is stored. Each answer derives it from the cost with the margin level asked for (or the default one),
 *    always from the cost, never from another price (ADR-0011, ADR-0014).
 *  - `cost_updated_at` moves only when the cost changes or somebody confirms it, not with any other edit, so the
 *    alert of a stale cost means what it says.
 *  - A product is active only under an active supplier, group and unit (and brand). Saving locks the supplier, so a
 *    product never enters while the cascade of its deactivation runs (ADR-0023).
 */
final class ProductService
{
    private const ENTITY = 'products';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly ProductRepository $products,
        private readonly SequenceGenerator $sequences,
        private readonly AuditLogger $audit,
        private readonly PriceService $prices,
    ) {
    }

    /**
     * @param string|null $marginLevelId the level the prices are computed with; null for the default
     * @return array{items: list<ProductView>, total: int, basis: PriceBasis}
     * @throws ValidationException 422 `margin_level_id`
     */
    public function list(ProductFilters $filters, ProductOrder $order, ?string $marginLevelId, Pagination $page): array
    {
        $basis = $this->prices->basis($marginLevelId);
        $staleBefore = $this->staleBefore($basis);
        $result = $this->products->search($filters, $order, $staleBefore, $page);

        return [
            'items' => array_map(
                fn (ProductRecord $record): ProductView => $this->view($record, $basis, $staleBefore),
                $result['records'],
            ),
            'total' => $result['total'],
            'basis' => $basis,
        ];
    }

    public function get(string $id, ?string $marginLevelId): ProductView
    {
        $basis = $this->prices->basis($marginLevelId);
        $record = $this->products->find($id) ?? throw ApiException::notFound();

        return $this->view($record, $basis, $this->staleBefore($basis));
    }

    /**
     * @throws ValidationException 422 `not_found` on the supplier, group, brand or unit that is missing or inactive
     */
    public function create(ActorContext $actor, ProductData $data): ProductView
    {
        $id = Uuid::v7();
        $this->connection->transactional(function () use ($actor, $data, $id): void {
            $this->requireUsableReferences($data, null);
            $code = $this->sequences->next('product');
            $this->products->insert($id, $code, $data, $this->clock->now());
            $this->audit->record(
                $actor,
                'create',
                self::ENTITY,
                $id,
                null,
                ['code' => $code] + $data->toArray() + ['is_active' => true],
            );
        });

        return $this->get($id, null);
    }

    /**
     * Replaces the data of the product. The cost counts as updated when its value changes or `$costReviewed` says
     * somebody checked it and it stays the same; saving anything else leaves the date alone.
     *
     * @throws ApiException 404 or 409 `conflict` (stale version)
     * @throws ValidationException 422 `not_found` on a reference that is missing or inactive (the one the product
     *         already had is accepted)
     */
    public function update(
        ActorContext $actor,
        string $id,
        int $version,
        ProductData $data,
        bool $costReviewed,
    ): ProductView {
        $this->connection->transactional(function () use ($actor, $id, $version, $data, $costReviewed): void {
            if (!$this->products->lock($id)) {
                throw ApiException::notFound();
            }
            $current = $this->products->find($id) ?? throw ApiException::notFound();
            $this->requireUsableReferences($data, $current->data);

            $costMoment = $costReviewed || $data->cost !== $current->data->cost;
            $now = $this->clock->now();
            if (!$this->products->update($id, $version, $data, $costMoment, $now)) {
                throw ApiException::conflict();
            }

            $before = $current->data->toArray();
            $after = $data->toArray();
            if ($costMoment) {
                $before['cost_updated_at'] = Timestamps::toIso($current->costUpdatedAt);
                $after['cost_updated_at'] = Timestamps::toIso($now);
            }
            $changed = array_keys(array_filter(
                $after,
                static fn (mixed $value, string $field): bool => $value !== $before[$field],
                ARRAY_FILTER_USE_BOTH,
            ));
            if ($changed === []) {
                return;
            }
            // Only the date moved: somebody confirmed the cost, which the history says apart from an edit.
            $action = $changed === ['cost_updated_at'] ? 'cost_review' : 'update';
            $this->audit->record(
                $actor,
                $action,
                self::ENTITY,
                $id,
                array_intersect_key($before, array_flip($changed)),
                array_intersect_key($after, array_flip($changed)),
            );
        });

        return $this->get($id, null);
    }

    /** Idempotent. */
    public function deactivate(ActorContext $actor, string $id): ProductView
    {
        $this->connection->transactional(function () use ($actor, $id): void {
            if (!$this->products->lock($id)) {
                throw ApiException::notFound();
            }
            $this->deactivateMany($actor, [$id]);
        });

        return $this->get($id, null);
    }

    /**
     * Idempotent.
     *
     * @throws ValidationException 422 `supplier_id: parent_inactive` while its supplier is deactivated
     */
    public function reactivate(ActorContext $actor, string $id): ProductView
    {
        $this->connection->transactional(function () use ($actor, $id): void {
            if (!$this->products->lock($id)) {
                throw ApiException::notFound();
            }
            $result = $this->reactivateMany($actor, [$id]);
            if ($result['blocked'] > 0) {
                throw ValidationException::field('supplier_id', 'parent_inactive');
            }
        });

        return $this->get($id, null);
    }

    /**
     * Deactivates these products by hand, in one transaction and with an entry per product in the history.
     *
     * @param list<string> $ids
     * @return array{affected: int, unchanged: int, blocked: int}
     * @throws ValidationException 422 `ids: not_found` when one does not exist
     */
    public function deactivateMany(ActorContext $actor, array $ids): array
    {
        return $this->connection->transactional(function () use ($actor, $ids): array {
            $states = $this->statesOf($ids);
            $affected = array_values(array_filter($ids, static fn (string $id): bool => $states[$id]['active']));
            if ($affected !== []) {
                $now = $this->clock->now();
                $this->products->setDeletedAtMany($affected, $now, 'manual', $now);
                $this->audit->recordMany($actor, 'deactivate', self::ENTITY, array_map(
                    static fn (string $id): array => [
                        'id' => $id,
                        'before' => ['is_active' => true, 'deactivation_reason' => null],
                        'after' => ['is_active' => false, 'deactivation_reason' => 'manual'],
                    ],
                    $affected,
                ));
            }

            return ['affected' => count($affected), 'unchanged' => count($ids) - count($affected), 'blocked' => 0];
        });
    }

    /**
     * Reactivates these products. One whose supplier is deactivated stays as it is and counts as blocked.
     *
     * @param list<string> $ids
     * @return array{affected: int, unchanged: int, blocked: int}
     * @throws ValidationException 422 `ids: not_found` when one does not exist
     */
    public function reactivateMany(ActorContext $actor, array $ids): array
    {
        return $this->connection->transactional(function () use ($actor, $ids): array {
            $states = $this->statesOf($ids);
            $inactive = array_values(array_filter($ids, static fn (string $id): bool => !$states[$id]['active']));
            $affected = array_values(array_filter(
                $inactive,
                static fn (string $id): bool => $states[$id]['supplier_active'],
            ));
            if ($affected !== []) {
                $now = $this->clock->now();
                $this->products->setDeletedAtMany($affected, null, null, $now);
                $this->audit->recordMany($actor, 'reactivate', self::ENTITY, array_map(
                    static fn (string $id): array => [
                        'id' => $id,
                        'before' => ['is_active' => false, 'deactivation_reason' => $states[$id]['reason']],
                        'after' => ['is_active' => true, 'deactivation_reason' => null],
                    ],
                    $affected,
                ));
            }

            return [
                'affected' => count($affected),
                'unchanged' => count($ids) - count($inactive),
                'blocked' => count($inactive) - count($affected),
            ];
        });
    }

    /**
     * Reactivates every product a supplier took down with it (and no other: one deactivated by hand stays so).
     *
     * @return array{affected: int, unchanged: int, blocked: int}
     * @throws ValidationException 422 `supplier_id: not_found` (unknown) or `parent_inactive` (still deactivated)
     */
    public function reactivateOfSupplier(ActorContext $actor, string $supplierId): array
    {
        return $this->connection->transactional(function () use ($actor, $supplierId): array {
            if (!$this->products->isActive('suppliers', $supplierId, true)) {
                throw ValidationException::field('supplier_id', 'parent_inactive');
            }
            $ids = $this->products->lockInactiveBySupplier($supplierId);

            if ($ids === []) {
                return ['affected' => 0, 'unchanged' => 0, 'blocked' => 0];
            }

            return $this->reactivateMany($actor, $ids);
        });
    }

    /**
     * Says the cost of the product was checked and stays the same: it stops being stale without changing.
     *
     * @throws ApiException 404, or 409 `product_inactive`
     */
    public function confirmCost(ActorContext $actor, string $id): ProductView
    {
        $this->connection->transactional(function () use ($actor, $id): void {
            $state = $this->products->lockedStates([$id])[$id] ?? throw ApiException::notFound();
            if (!$state['active']) {
                throw ApiException::conflict('product_inactive', 'A deactivated product has no cost to confirm.');
            }
            $this->confirmCostMany($actor, [$id]);
        });

        return $this->get($id, null);
    }

    /**
     * Confirms the cost of these products; the deactivated ones are left out and counted as unchanged.
     *
     * @param list<string> $ids
     * @return array{affected: int, unchanged: int, blocked: int}
     * @throws ValidationException 422 `ids: not_found` when one does not exist
     */
    public function confirmCostMany(ActorContext $actor, array $ids): array
    {
        return $this->connection->transactional(function () use ($actor, $ids): array {
            $states = $this->statesOf($ids);
            $affected = array_values(array_filter($ids, static fn (string $id): bool => $states[$id]['active']));
            if ($affected !== []) {
                $now = $this->clock->now();
                $this->products->confirmCostMany($affected, $now);
                $this->audit->recordMany($actor, 'cost_review', self::ENTITY, array_map(
                    static fn (string $id): array => [
                        'id' => $id,
                        'before' => ['cost_updated_at' => Timestamps::toIso($states[$id]['cost_updated_at'])],
                        'after' => ['cost_updated_at' => Timestamps::toIso($now)],
                    ],
                    $affected,
                ));
            }

            return ['affected' => count($affected), 'unchanged' => count($ids) - count($affected), 'blocked' => 0];
        });
    }

    /**
     * The state of each product, locked; the call fails when one does not exist.
     *
     * @param list<string> $ids
     * @return array<string, array{
     *     active: bool, reason: string|null, supplier_active: bool, cost_updated_at: \DateTimeImmutable
     * }>
     */
    private function statesOf(array $ids): array
    {
        $states = $this->products->lockedStates($ids);
        if (count($states) !== count($ids)) {
            throw ValidationException::field('ids', 'not_found');
        }

        return $states;
    }

    /**
     * A product points at active things. The supplier is locked first so the cascade of its deactivation and this
     * save never interleave. What the product already pointed at is accepted even if it was switched off since.
     *
     * @throws ValidationException 422 `not_found` on each reference that is not usable
     */
    private function requireUsableReferences(ProductData $data, ?ProductData $current): void
    {
        $checks = [
            'supplier_id' => ['suppliers', $data->supplierId, $current?->supplierId],
            'group_id' => ['product_groups', $data->groupId, $current?->groupId],
            'brand_id' => ['brands', $data->brandId, $current?->brandId],
            'unit_id' => ['units_of_measure', $data->unitId, $current?->unitId],
        ];

        $errors = [];
        foreach ($checks as $field => [$table, $wanted, $already]) {
            if ($wanted === null) {
                continue;
            }
            // The supplier is read with a lock whether or not it changed.
            $usable = $this->products->isActive($table, $wanted, $table === 'suppliers');
            if (!$usable && $wanted !== $already) {
                $errors[] = ['field' => $field, 'code' => 'not_found'];
            }
        }
        if ($errors !== []) {
            throw new ValidationException($errors);
        }
    }

    private function staleBefore(PriceBasis $basis): \DateTimeImmutable
    {
        return $this->clock->now()->modify(sprintf('-%d days', $basis->staleCostDays));
    }

    private function view(ProductRecord $record, PriceBasis $basis, \DateTimeImmutable $staleBefore): ProductView
    {
        return new ProductView($record, $basis, $this->prices->priceFor($basis, $record->data->cost), $staleBefore);
    }
}
