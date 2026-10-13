<?php

declare(strict_types=1);

namespace Soltec\Modules\Suppliers\Domain;

/** A place of a supplier. At most one is the primary one. */
final class SupplierAddress
{
    public function __construct(
        public readonly string $label,
        public readonly string $address,
        public readonly ?string $zone,
        public readonly ?string $country,
        public readonly bool $isPrimary,
    ) {
    }

    /** @return array{label: string, address: string, zone: string|null, country: string|null, is_primary: bool} */
    public function toArray(): array
    {
        return [
            'label' => $this->label,
            'address' => $this->address,
            'zone' => $this->zone,
            'country' => $this->country,
            'is_primary' => $this->isPrimary,
        ];
    }
}
