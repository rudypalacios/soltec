<?php

declare(strict_types=1);

namespace Soltec\Modules\Products\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Modules\Settings\Domain\Price;
use Soltec\Modules\Settings\Domain\PriceBasis;

/**
 * A stored bundle with what its components add up to. Nothing about cost or price is stored: the cost is the sum of
 * quantity times cost of the components (rounded once, to four decimals) and the price is derived from it each time
 * it is read (ADR-0011). The cost is as old as its oldest component, and the bundle checks availability when any of
 * them does.
 */
final class BundleRecord
{
    /**
     * @param array{id: string, name: string} $group
     * @param array{id: string, name: string} $area
     * @param array{id: string, name: string}|null $brand
     * @param list<array{id: string, name: string}> $suppliers those of the components, by name
     * @param list<BundleComponent>|null $items only when the bundle is read on its own
     * @param array{code: string, name: string}|null $matchedComponent the component a search matched, in a list
     */
    public function __construct(
        public readonly string $id,
        public readonly string $code,
        public readonly string $name,
        public readonly ?string $description,
        public readonly array $group,
        public readonly array $area,
        public readonly ?array $brand,
        public readonly array $suppliers,
        public readonly string $cost,
        public readonly DateTimeImmutable $costUpdatedAt,
        public readonly int $componentCount,
        public readonly int $inactiveComponentCount,
        public readonly bool $checkAvailability,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $updatedAt,
        public readonly int $version,
        public readonly ?DateTimeImmutable $deletedAt,
        public readonly ?array $items = null,
        public readonly ?array $matchedComponent = null,
    ) {
    }

    public function isActive(): bool
    {
        return $this->deletedAt === null;
    }

    /** @param array{code: string, name: string}|null $matched */
    public function withMatchedComponent(?array $matched): self
    {
        return new self(
            $this->id,
            $this->code,
            $this->name,
            $this->description,
            $this->group,
            $this->area,
            $this->brand,
            $this->suppliers,
            $this->cost,
            $this->costUpdatedAt,
            $this->componentCount,
            $this->inactiveComponentCount,
            $this->checkAvailability,
            $this->createdAt,
            $this->updatedAt,
            $this->version,
            $this->deletedAt,
            $this->items,
            $matched,
        );
    }

    /**
     * @param Price|null $price null when it could not be computed
     * @return array<string, mixed> the `Bundle` schema of the contract; `items` only when read on its own
     */
    public function toApi(PriceBasis $basis, ?Price $price, DateTimeImmutable $staleBefore): array
    {
        $body = [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'description' => $this->description,
            'group' => $this->group,
            'area' => $this->area,
            'brand' => $this->brand,
            'suppliers' => $this->suppliers,
            'component_count' => $this->componentCount,
            'cost' => $this->cost,
            'cost_updated_at' => Timestamps::toIso($this->costUpdatedAt),
            'cost_is_stale' => $this->costUpdatedAt < $staleBefore,
            'has_inactive_components' => $this->inactiveComponentCount > 0,
            'inactive_component_count' => $this->inactiveComponentCount,
            'check_availability' => $this->checkAvailability,
            'margin_level' => ['id' => $basis->level->id, 'name' => $basis->level->name, 'rate' => $basis->level->rate],
            'price_without_vat' => $price?->withoutVat,
            'price_with_vat' => $price?->withVat,
            'is_active' => $this->isActive(),
            'matched_component' => $this->matchedComponent,
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
        if ($this->items !== null) {
            $body['items'] = array_map(
                static fn (BundleComponent $item): array => $item->toApi($staleBefore),
                $this->items,
            );
        }

        return $body;
    }
}
