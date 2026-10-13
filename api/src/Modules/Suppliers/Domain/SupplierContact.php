<?php

declare(strict_types=1);

namespace Soltec\Modules\Suppliers\Domain;

/**
 * A person at the supplier. Not a row of `contacts`: it belongs to the supplier, so everyone who may see the
 * supplier sees it (ADR-0025). `contactTypeName` is filled when it is read, for display.
 */
final class SupplierContact
{
    public function __construct(
        public readonly string $name,
        public readonly ?string $jobTitle,
        public readonly ?string $contactTypeId,
        public readonly ?string $phone,
        public readonly ?string $mobile,
        public readonly ?string $email,
        public readonly ?string $address,
        public readonly ?string $zone,
        public readonly ?string $country,
        public readonly ?string $contactTypeName = null,
    ) {
    }

    /** @return array<string, string|null> the fields as the audit log records them (the type by its id) */
    public function toArray(): array
    {
        return [
            'name' => $this->name,
            'job_title' => $this->jobTitle,
            'contact_type_id' => $this->contactTypeId,
            'phone' => $this->phone,
            'mobile' => $this->mobile,
            'email' => $this->email,
            'address' => $this->address,
            'zone' => $this->zone,
            'country' => $this->country,
        ];
    }

    /** @return array<string, mixed> the `SupplierContact` schema of the contract */
    public function toApi(): array
    {
        $fields = $this->toArray();
        unset($fields['contact_type_id']);
        $type = $this->contactTypeId === null
            ? null
            : ['id' => $this->contactTypeId, 'name' => (string) $this->contactTypeName];

        return ['name' => $fields['name'], 'job_title' => $fields['job_title'], 'contact_type' => $type]
            + $fields;
    }
}
