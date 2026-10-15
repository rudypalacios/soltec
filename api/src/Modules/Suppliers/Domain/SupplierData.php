<?php

declare(strict_types=1);

namespace Soltec\Modules\Suppliers\Domain;

use Soltec\Kernel\Address;
use Soltec\Kernel\Identification;

/**
 * What a person enters about a supplier. `identification` is canonical (see {@see Identification}) and null for the
 * type `none`; `creditLimit` is a decimal string with at most two decimals.
 */
final class SupplierData
{
    /**
     * @param list<Address> $addresses
     * @param list<SupplierContact> $contacts
     */
    public function __construct(
        public readonly string $name,
        public readonly ?string $legalName,
        public readonly string $identificationType,
        public readonly ?string $identification,
        public readonly ?int $creditDays,
        public readonly ?string $creditLimit,
        public readonly array $addresses,
        public readonly array $contacts,
    ) {
    }

    /** @return array<string, mixed> the fields as the audit log records them */
    public function toArray(): array
    {
        return [
            'name' => $this->name,
            'legal_name' => $this->legalName,
            'identification_type' => $this->identificationType,
            'identification' => $this->identification,
            'credit_days' => $this->creditDays,
            'credit_limit' => $this->creditLimit,
            'addresses' => array_map(static fn (Address $a): array => $a->toArray(), $this->addresses),
            'contacts' => array_map(static fn (SupplierContact $c): array => $c->toArray(), $this->contacts),
        ];
    }
}
