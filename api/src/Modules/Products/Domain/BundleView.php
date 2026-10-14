<?php

declare(strict_types=1);

namespace Soltec\Modules\Products\Domain;

use DateTimeImmutable;
use Soltec\Modules\Settings\Domain\Price;
use Soltec\Modules\Settings\Domain\PriceBasis;

/** A bundle as it is shown: the record with its price derived from the cost its components add up to. */
final class BundleView
{
    public function __construct(
        public readonly BundleRecord $record,
        public readonly PriceBasis $basis,
        public readonly ?Price $price,
        public readonly DateTimeImmutable $staleBefore,
    ) {
    }

    /** @return array<string, mixed> the `Bundle` schema of the contract */
    public function toApi(): array
    {
        return $this->record->toApi($this->basis, $this->price, $this->staleBefore);
    }
}
