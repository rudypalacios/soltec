<?php

declare(strict_types=1);

namespace Soltec\Modules\Clients\Domain;

/** What a customer is invoiced with. Only a customer has one; a prospect does not. `creditLimit` is a decimal string. */
final class BillingProfile
{
    public function __construct(
        public readonly string $legalName,
        public readonly string $taxRegimeId,
        public readonly ?string $paymentMethodId,
        public readonly ?int $creditDays,
        public readonly ?string $creditLimit,
    ) {
    }

    /** @return array<string, string|int|null> the fields as the audit log records them */
    public function toArray(): array
    {
        return [
            'legal_name' => $this->legalName,
            'tax_regime_id' => $this->taxRegimeId,
            'payment_method_id' => $this->paymentMethodId,
            'credit_days' => $this->creditDays,
            'credit_limit' => $this->creditLimit,
        ];
    }
}
