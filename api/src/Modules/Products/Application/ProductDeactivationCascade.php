<?php

declare(strict_types=1);

namespace Soltec\Modules\Products\Application;

use Soltec\Kernel\Clock;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Products\Persistence\ProductRepository;
use Soltec\Modules\Suppliers\Application\DeactivationCascade;

/**
 * Deactivating a supplier takes its active products down with it, marked as turned off by the supplier so they can be
 * reactivated together; one a person had turned off keeps its own reason (ADR-0023). It runs in the transaction of
 * the supplier, with one audit entry per product.
 */
final class ProductDeactivationCascade implements DeactivationCascade
{
    public const REASON = 'supplier';

    public function __construct(
        private readonly Clock $clock,
        private readonly ProductRepository $products,
        private readonly AuditLogger $audit,
    ) {
    }

    public function deactivateFor(ActorContext $actor, string $supplierId): int
    {
        $ids = $this->products->lockActiveOfSupplier($supplierId);
        if ($ids === []) {
            return 0;
        }

        $now = $this->clock->now();
        $this->products->setDeletedAtMany($ids, $now, self::REASON, $now);
        $this->audit->recordMany($actor, 'deactivate', 'products', array_map(
            static fn (string $id): array => [
                'id' => $id,
                'before' => ['is_active' => true, 'deactivation_reason' => null],
                'after' => ['is_active' => false, 'deactivation_reason' => self::REASON],
            ],
            $ids,
        ));

        return count($ids);
    }

    public function inactiveCountFor(string $supplierId): int
    {
        return $this->products->countInactiveBySupplier($supplierId);
    }
}
