<?php

declare(strict_types=1);

namespace Soltec\Modules\Products\Domain;

use DateTimeImmutable;
use Soltec\Modules\Settings\Domain\Price;
use Soltec\Modules\Settings\Domain\PriceBasis;

/** A product as it is shown: the record with its price derived from the cost and its stale-cost alert. */
final class ProductView
{
    public function __construct(
        public readonly ProductRecord $record,
        public readonly PriceBasis $basis,
        public readonly ?Price $price,
        public readonly DateTimeImmutable $staleBefore,
    ) {
    }

    /** @return array<string, mixed> the `Product` schema of the contract */
    public function toApi(): array
    {
        return $this->record->toApi($this->basis, $this->price, $this->staleBefore);
    }
}
