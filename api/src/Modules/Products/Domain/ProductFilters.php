<?php

declare(strict_types=1);

namespace Soltec\Modules\Products\Domain;

/** What a product list is narrowed by. A null criterion does not narrow. */
final class ProductFilters
{
    public function __construct(
        public readonly ?string $text,
        /** active, inactive or all */
        public readonly string $status,
        public readonly ?string $supplierId,
        public readonly ?string $areaId,
        public readonly ?string $groupId,
        public readonly ?string $brandId,
        /** Only the products whose cost is stale. */
        public readonly bool $staleOnly,
    ) {
    }
}
