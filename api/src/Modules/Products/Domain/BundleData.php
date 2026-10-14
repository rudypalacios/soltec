<?php

declare(strict_types=1);

namespace Soltec\Modules\Products\Domain;

/** What a person enters about a bundle: its own data and its components, in the order they were listed. */
final class BundleData
{
    /** @param list<BundleItemData> $items */
    public function __construct(
        public readonly string $name,
        public readonly ?string $description,
        public readonly string $groupId,
        public readonly ?string $brandId,
        public readonly array $items,
    ) {
    }

    /** @return array<string, mixed> the fields as the audit log records them */
    public function toArray(): array
    {
        return [
            'name' => $this->name,
            'description' => $this->description,
            'group_id' => $this->groupId,
            'brand_id' => $this->brandId,
            'items' => array_map(static fn (BundleItemData $item): array => $item->toArray(), $this->items),
        ];
    }
}
