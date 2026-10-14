<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Domain;

/**
 * What a list of prices is computed with: the margin level and the tax rates in force when it is read. It is
 * resolved once for a whole page, so the rows are priced with the same values and without a query each. It also
 * carries the days after which a cost counts as stale and the currency code, which come from the same settings row.
 */
final class PriceBasis
{
    public function __construct(
        public readonly MarginLevelRecord $level,
        public readonly string $vatRate,
        public readonly string $incomeTaxRate,
        public readonly int $staleCostDays,
        public readonly string $currencyCode,
    ) {
    }
}
