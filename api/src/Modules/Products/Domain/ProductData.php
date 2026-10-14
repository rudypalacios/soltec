<?php

declare(strict_types=1);

namespace Soltec\Modules\Products\Domain;

/** What a person enters about a product. `cost` is a decimal string with exactly four decimals. */
final class ProductData
{
    public function __construct(
        public readonly string $name,
        public readonly ?string $description,
        public readonly string $supplierId,
        public readonly string $groupId,
        public readonly ?string $brandId,
        public readonly string $unitId,
        public readonly string $cost,
        public readonly bool $checkAvailability,
    ) {
    }

    /** @return array<string, mixed> the fields as the audit log records them */
    public function toArray(): array
    {
        return [
            'name' => $this->name,
            'description' => $this->description,
            'supplier_id' => $this->supplierId,
            'group_id' => $this->groupId,
            'brand_id' => $this->brandId,
            'unit_id' => $this->unitId,
            'cost' => $this->cost,
            'check_availability' => $this->checkAvailability,
        ];
    }
}
