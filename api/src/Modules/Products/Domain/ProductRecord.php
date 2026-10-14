<?php

declare(strict_types=1);

namespace Soltec\Modules\Products\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Modules\Settings\Domain\Price;
use Soltec\Modules\Settings\Domain\PriceBasis;

/**
 * A stored product with the names of what it points at. The price is not part of it: it is derived from the cost each
 * time it is read (ADR-0011).
 */
final class ProductRecord
{
    public function __construct(
        public readonly string $id,
        public readonly string $code,
        public readonly ProductData $data,
        /** @var array{id: string, name: string} */
        public readonly array $supplier,
        /** @var array{id: string, name: string} */
        public readonly array $group,
        /** @var array{id: string, name: string} */
        public readonly array $area,
        /** @var array{id: string, name: string}|null */
        public readonly ?array $brand,
        /** @var array{id: string, name: string} */
        public readonly array $unit,
        public readonly DateTimeImmutable $costUpdatedAt,
        public readonly ?string $deactivationReason,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $updatedAt,
        public readonly int $version,
        public readonly ?DateTimeImmutable $deletedAt,
    ) {
    }

    public function isActive(): bool
    {
        return $this->deletedAt === null;
    }

    /**
     * Whether the cost was last updated or confirmed longer ago than the limit.
     *
     * @param DateTimeImmutable $staleBefore the moment before which a cost counts as stale
     */
    public function isCostStale(DateTimeImmutable $staleBefore): bool
    {
        return $this->costUpdatedAt < $staleBefore;
    }

    /**
     * @param PriceBasis $basis the level and rates the prices were computed with
     * @param Price|null $price null when it could not be computed
     * @return array<string, mixed> the `Product` schema of the contract
     */
    public function toApi(PriceBasis $basis, ?Price $price, DateTimeImmutable $staleBefore): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->data->name,
            'description' => $this->data->description,
            'supplier' => $this->supplier,
            'group' => $this->group,
            'area' => $this->area,
            'brand' => $this->brand,
            'unit' => $this->unit,
            'cost' => $this->data->cost,
            'cost_updated_at' => Timestamps::toIso($this->costUpdatedAt),
            'cost_is_stale' => $this->isCostStale($staleBefore),
            'margin_level' => ['id' => $basis->level->id, 'name' => $basis->level->name, 'rate' => $basis->level->rate],
            'price_without_vat' => $price?->withoutVat,
            'price_with_vat' => $price?->withVat,
            'check_availability' => $this->data->checkAvailability,
            'is_active' => $this->isActive(),
            'deactivation_reason' => $this->deactivationReason,
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
    }
}
