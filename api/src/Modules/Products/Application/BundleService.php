<?php

declare(strict_types=1);

namespace Soltec\Modules\Products\Application;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Products\Domain\BundleData;
use Soltec\Modules\Products\Domain\BundleItemData;
use Soltec\Modules\Products\Domain\BundleRecord;
use Soltec\Modules\Products\Domain\BundleView;
use Soltec\Modules\Products\Domain\ProductFilters;
use Soltec\Modules\Products\Domain\ProductOrder;
use Soltec\Modules\Products\Persistence\BundleRepository;
use Soltec\Modules\Settings\Application\PriceService;
use Soltec\Modules\Settings\Application\SequenceGenerator;
use Soltec\Modules\Settings\Domain\PriceBasis;

/**
 * Administration of bundles: compound products. They have no owner or data scope; the permissions of the resource
 * are the only gate.
 *
 * Three rules shape it:
 *  - Nothing about cost or price is stored. Each answer adds up quantity times cost of the components and derives
 *    the price from that sum with the margin level asked for, so a change of cost in Products reaches every bundle
 *    that has the product (ADR-0011, ADR-0014).
 *  - A component is an active simple product, once per bundle. One that is deactivated later stays in the bundle,
 *    which says so (`has_inactive_components`) and, from the Cotizador on, cannot be quoted.
 *  - Saving replaces the components as a set, in one transaction with the bundle.
 */
final class BundleService
{
    private const ENTITY = 'bundles';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly BundleRepository $bundles,
        private readonly SequenceGenerator $sequences,
        private readonly AuditLogger $audit,
        private readonly PriceService $prices,
    ) {
    }

    /**
     * @param string|null $marginLevelId the level the prices are computed with; null for the default
     * @return array{items: list<BundleView>, total: int, basis: PriceBasis}
     * @throws ValidationException 422 `margin_level_id`
     */
    public function list(ProductFilters $filters, ProductOrder $order, ?string $marginLevelId, Pagination $page): array
    {
        $basis = $this->prices->basis($marginLevelId);
        $staleBefore = $this->staleBefore($basis);
        $result = $this->bundles->search($filters, $order, $staleBefore, $page);

        return [
            'items' => array_map(
                fn (BundleRecord $record): BundleView => $this->view($record, $basis, $staleBefore),
                $result['records'],
            ),
            'total' => $result['total'],
            'basis' => $basis,
        ];
    }

    public function get(string $id, ?string $marginLevelId): BundleView
    {
        $basis = $this->prices->basis($marginLevelId);
        $record = $this->bundles->find($id) ?? throw ApiException::notFound();

        return $this->view($record, $basis, $this->staleBefore($basis));
    }

    /**
     * Active products to choose a component among, with their cost.
     *
     * @param list<string> $excluded
     * @return list<array<string, mixed>>
     */
    public function candidates(?string $text, array $excluded, int $limit): array
    {
        return $this->bundles->candidates($text, $excluded, $limit);
    }

    /**
     * @throws ValidationException 422 `not_found` on the group, the brand or a component that is missing or inactive
     */
    public function create(ActorContext $actor, BundleData $data): BundleView
    {
        $id = Uuid::v7();
        $this->connection->transactional(function () use ($actor, $data, $id): void {
            $this->requireUsableReferences($data, null, []);
            $code = $this->sequences->next('bundle');
            $this->bundles->insert($id, $code, $data, $this->clock->now());
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
     * Replaces the data and the components of the bundle. What it already pointed at is accepted even if it was
     * switched off since.
     *
     * @throws ApiException 404 or 409 `conflict` (stale version)
     * @throws ValidationException 422 `not_found` on a reference that is missing or inactive
     */
    public function update(ActorContext $actor, string $id, int $version, BundleData $data): BundleView
    {
        $this->connection->transactional(function () use ($actor, $id, $version, $data): void {
            if (!$this->bundles->lock($id)) {
                throw ApiException::notFound();
            }
            $current = $this->bundles->find($id) ?? throw ApiException::notFound();
            $currentItems = $this->bundles->productIdsOf($id);
            $before = $this->dataOf($current);
            $this->requireUsableReferences($data, $before, $currentItems);

            if (!$this->bundles->update($id, $version, $data, $this->clock->now())) {
                throw ApiException::conflict();
            }

            $after = $data->toArray();
            $beforeFields = $before->toArray();
            $changed = array_keys(array_filter(
                $after,
                static fn (mixed $value, string $field): bool => $value !== $beforeFields[$field],
                ARRAY_FILTER_USE_BOTH,
            ));
            if ($changed === []) {
                return;
            }
            $this->audit->record(
                $actor,
                'update',
                self::ENTITY,
                $id,
                array_intersect_key($beforeFields, array_flip($changed)),
                array_intersect_key($after, array_flip($changed)),
            );
        });

        return $this->get($id, null);
    }

    /** Idempotent. */
    public function deactivate(ActorContext $actor, string $id): BundleView
    {
        return $this->setActive($actor, $id, false);
    }

    /**
     * Idempotent.
     *
     * @throws ValidationException 422 `group_id: parent_inactive` while its group is deactivated
     */
    public function reactivate(ActorContext $actor, string $id): BundleView
    {
        return $this->setActive($actor, $id, true);
    }

    private function setActive(ActorContext $actor, string $id, bool $active): BundleView
    {
        $this->connection->transactional(function () use ($actor, $id, $active): void {
            if (!$this->bundles->lock($id)) {
                throw ApiException::notFound();
            }
            $current = $this->bundles->find($id) ?? throw ApiException::notFound();
            if ($current->isActive() === $active) {
                return;
            }
            if ($active && !$this->bundles->isActive('product_groups', $current->group['id'])) {
                throw ValidationException::field('group_id', 'parent_inactive');
            }
            $this->bundles->setDeletedAt($id, $active ? null : $this->clock->now(), $this->clock->now());
            $this->audit->record(
                $actor,
                $active ? 'reactivate' : 'deactivate',
                self::ENTITY,
                $id,
                ['is_active' => !$active],
                ['is_active' => $active],
            );
        });

        return $this->get($id, null);
    }

    /** The data a stored bundle was saved with, to tell what an edit changes. */
    private function dataOf(BundleRecord $record): BundleData
    {
        $items = array_map(
            static fn ($component): BundleItemData => new BundleItemData($component->productId, $component->quantity),
            $record->items ?? [],
        );

        return new BundleData(
            $record->name,
            $record->description,
            $record->group['id'],
            $record->brand['id'] ?? null,
            $items,
        );
    }

    /**
     * A bundle points at an active group and brand and is made of active products. What it already pointed at is
     * accepted even if it was switched off since.
     *
     * @param list<string> $currentProductIds the components the bundle has now
     * @throws ValidationException 422 `not_found` on each reference that is not usable
     */
    private function requireUsableReferences(BundleData $data, ?BundleData $current, array $currentProductIds): void
    {
        $errors = [];
        $checks = [
            'group_id' => ['product_groups', $data->groupId, $current?->groupId],
            'brand_id' => ['brands', $data->brandId, $current?->brandId],
        ];
        foreach ($checks as $field => [$table, $wanted, $already]) {
            if ($wanted !== null && $wanted !== $already && !$this->bundles->isActive($table, $wanted)) {
                $errors[] = ['field' => $field, 'code' => 'not_found'];
            }
        }
        foreach ($data->items as $position => $item) {
            $stays = in_array($item->productId, $currentProductIds, true);
            if (!$stays && !$this->bundles->isActive('products', $item->productId)) {
                $errors[] = ['field' => sprintf('items.%d.product_id', $position), 'code' => 'not_found'];
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

    private function view(BundleRecord $record, PriceBasis $basis, \DateTimeImmutable $staleBefore): BundleView
    {
        return new BundleView($record, $basis, $this->prices->priceFor($basis, $record->cost), $staleBefore);
    }
}
