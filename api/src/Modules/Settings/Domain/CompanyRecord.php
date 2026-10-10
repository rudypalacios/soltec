<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/** The company's data: the only row of `company`. Everything printed or shown as "who we are" comes from here. */
final class CompanyRecord
{
    public function __construct(
        public readonly string $id,
        public readonly string $legalName,
        public readonly string $tradeName,
        public readonly string $taxId,
        public readonly ?string $address,
        public readonly ?string $phone,
        public readonly ?string $email,
        public readonly string $timezone,
        public readonly ?string $logoPath,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $updatedAt,
        public readonly int $version,
    ) {
    }

    /**
     * Changes whenever the logo does (the file name carries a hash of its content), so a client can cache the image
     * for good and ask for it again only when this value differs.
     */
    public function logoVersion(): ?string
    {
        return $this->logoPath === null ? null : pathinfo($this->logoPath, PATHINFO_FILENAME);
    }

    /** @return array<string, mixed> the `Company` schema of the contract */
    public function toApi(): array
    {
        return [
            'legal_name' => $this->legalName,
            'trade_name' => $this->tradeName,
            'tax_id' => $this->taxId,
            'address' => $this->address,
            'phone' => $this->phone,
            'email' => $this->email,
            'timezone' => $this->timezone,
            'logo_version' => $this->logoVersion(),
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
    }

    /** @return array<string, string|null> the fields an audit entry compares */
    public function auditData(): array
    {
        return [
            'legal_name' => $this->legalName,
            'trade_name' => $this->tradeName,
            'tax_id' => $this->taxId,
            'address' => $this->address,
            'phone' => $this->phone,
            'email' => $this->email,
            'timezone' => $this->timezone,
        ];
    }
}
