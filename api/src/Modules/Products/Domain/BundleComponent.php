<?php

declare(strict_types=1);

namespace Soltec\Modules\Products\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/**
 * A component of a bundle as it is shown: the product it points at, the unit and supplier of that product, how much
 * of it goes in, and what that costs. `lineCost` is rounded to four decimals for display; the cost of the bundle is
 * summed from the exact values, so the lines may differ from the total by a rounding.
 */
final class BundleComponent
{
    public function __construct(
        public readonly string $productId,
        public readonly string $code,
        public readonly string $name,
        /** @var array{id: string, name: string} */
        public readonly array $unit,
        /** @var array{id: string, name: string} */
        public readonly array $supplier,
        public readonly string $quantity,
        public readonly string $cost,
        public readonly string $lineCost,
        public readonly DateTimeImmutable $costUpdatedAt,
        public readonly bool $isActive,
    ) {
    }

    /** @return array<string, mixed> the `BundleComponent` schema of the contract */
    public function toApi(DateTimeImmutable $staleBefore): array
    {
        return [
            'product' => ['id' => $this->productId, 'code' => $this->code, 'name' => $this->name],
            'unit' => $this->unit,
            'supplier' => $this->supplier,
            'quantity' => $this->quantity,
            'cost' => $this->cost,
            'line_cost' => $this->lineCost,
            'cost_updated_at' => Timestamps::toIso($this->costUpdatedAt),
            'cost_is_stale' => $this->costUpdatedAt < $staleBefore,
            'is_active' => $this->isActive,
        ];
    }
}
