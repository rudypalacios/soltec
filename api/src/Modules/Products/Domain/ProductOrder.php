<?php

declare(strict_types=1);

namespace Soltec\Modules\Products\Domain;

/** How a product list is ordered; the id always breaks ties so pages never overlap. */
final class ProductOrder
{
    public const NAME = 'name';
    public const CODE = 'code';
    public const COST = 'cost';
    /** The cost that was reviewed longest ago first, to work through the stale ones. */
    public const COST_REVIEW = 'cost_review';

    public const SORTS = [self::NAME, self::CODE, self::COST, self::COST_REVIEW];

    public function __construct(
        public readonly string $sort,
        /** Area and group first, so a screen can show a header per block (it repeats across pages). */
        public readonly bool $grouped,
    ) {
    }
}
