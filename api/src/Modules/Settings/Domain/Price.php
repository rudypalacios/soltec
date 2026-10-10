<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Domain;

/** A computed catalog price, rounded to cents, as decimal strings ("35.33"). */
final class Price
{
    public function __construct(public readonly string $withoutVat, public readonly string $withVat)
    {
    }

    /** @return array<string, string> the `Price` schema of the contract */
    public function toApi(): array
    {
        return ['without_vat' => $this->withoutVat, 'with_vat' => $this->withVat];
    }
}
