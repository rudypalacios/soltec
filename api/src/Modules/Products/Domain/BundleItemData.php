<?php

declare(strict_types=1);

namespace Soltec\Modules\Products\Domain;

/** One component a person puts in a bundle: a product and how much of it. `quantity` has exactly three decimals. */
final class BundleItemData
{
    public function __construct(public readonly string $productId, public readonly string $quantity)
    {
    }

    /** @return array{product_id: string, quantity: string} */
    public function toArray(): array
    {
        return ['product_id' => $this->productId, 'quantity' => $this->quantity];
    }
}
