<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/**
 * Tax rates and business-rule periods: the only row of `financial_settings`. Rates are decimal strings ("0.12000"),
 * never floats, because prices are computed from them (ADR-0011).
 */
final class FinancialSettingsRecord
{
    public function __construct(
        public readonly string $id,
        public readonly string $currencyCode,
        public readonly string $vatRate,
        public readonly string $incomeTaxRate,
        public readonly int $staleCostDays,
        public readonly int $quoteValidityDays,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $updatedAt,
        public readonly int $version,
    ) {
    }

    /** @return array<string, mixed> the `FinancialSettings` schema of the contract */
    public function toApi(): array
    {
        return $this->auditData() + [
            'currency_code' => $this->currencyCode,
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
    }

    /** @return array<string, string|int> the fields an audit entry compares */
    public function auditData(): array
    {
        return [
            'vat_rate' => $this->vatRate,
            'income_tax_rate' => $this->incomeTaxRate,
            'stale_cost_days' => $this->staleCostDays,
            'quote_validity_days' => $this->quoteValidityDays,
        ];
    }
}
