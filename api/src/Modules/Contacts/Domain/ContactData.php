<?php

declare(strict_types=1);

namespace Soltec\Modules\Contacts\Domain;

/** What a person enters about a contact. Every field but the name may be empty (null). */
final class ContactData
{
    public function __construct(
        public readonly string $name,
        public readonly ?string $phone,
        public readonly ?string $mobile,
        public readonly ?string $email,
        public readonly ?string $address,
        public readonly ?string $zone,
        public readonly ?string $country,
    ) {
    }

    /** @return array<string, string|null> the fields as the audit log records them */
    public function toArray(): array
    {
        return [
            'name' => $this->name,
            'phone' => $this->phone,
            'mobile' => $this->mobile,
            'email' => $this->email,
            'address' => $this->address,
            'zone' => $this->zone,
            'country' => $this->country,
        ];
    }
}
