<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Domain;

use InvalidArgumentException;

/** An input the price function refuses. `reason` is one of the stable codes of `contract/test-vectors/price.json`. */
final class PriceException extends InvalidArgumentException
{
    public const INVALID_COST = 'invalid_cost';
    public const INVALID_RATE = 'invalid_rate';
    public const PRICE_TOO_LARGE = 'price_too_large';

    public function __construct(public readonly string $reason)
    {
        parent::__construct($reason);
    }
}
