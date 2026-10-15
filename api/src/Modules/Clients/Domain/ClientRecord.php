<?php

declare(strict_types=1);

namespace Soltec\Modules\Clients\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Address;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Identification;

/**
 * A stored client. A list carries the responsible adviser and the number of advisers but no addresses, billing
 * profile, advisers or contacts (`detailed` false); a single read carries them. `refs` holds the catalog values the
 * client points at as `{id, name}` (the status also its color), already read with it.
 *
 * `contacts` are only the ones the reader may see by the data scope of contacts: a contact linked to the client by
 * another adviser is not theirs to read (ADR-0025).
 */
final class ClientRecord
{
    /**
     * @param array<string, array{id: string, name: string, color?: string}|null> $refs
     * @param array{id: string, name: string}|null $responsible
     * @param list<array{user: array{id: string, name: string}, is_responsible: bool}>|null $sellers
     * @param list<array{
     *     contact: array{id: string, code: string, name: string},
     *     contact_type: array{id: string, name: string}
     * }>|null $contacts
     */
    public function __construct(
        public readonly string $id,
        public readonly string $code,
        public readonly string $type,
        public readonly ClientData $data,
        public readonly array $refs,
        public readonly ?DateTimeImmutable $convertedAt,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $updatedAt,
        public readonly int $version,
        public readonly ?DateTimeImmutable $deletedAt,
        public readonly ?array $responsible,
        public readonly int $sellerCount,
        public readonly ?array $sellers = null,
        public readonly ?array $contacts = null,
    ) {
    }

    public function isActive(): bool
    {
        return $this->deletedAt === null;
    }

    public function isCustomer(): bool
    {
        return $this->type === 'customer';
    }

    /** @return array<string, mixed> the `Client` (or `ClientSummary`) schema of the contract */
    public function toApi(): array
    {
        $data = $this->data;
        $api = [
            'id' => $this->id,
            'code' => $this->code,
            'type' => $this->type,
            'name' => $data->name,
            'identification_type' => $data->identificationType,
            'identification' => $data->identification === null
                ? null
                : Identification::display($data->identificationType, $data->identification),
            'status' => $this->refs['status'] ?? null,
            'segment' => $this->refs['segment'] ?? null,
            'area' => $this->refs['area'] ?? null,
            'margin_level' => $this->refs['margin_level'] ?? null,
            'converted_at' => $this->convertedAt === null ? null : Timestamps::toIso($this->convertedAt),
            'is_active' => $this->isActive(),
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
            'responsible' => $this->responsible,
            'seller_count' => $this->sellerCount,
        ];
        if ($this->sellers === null) {
            return $api;
        }

        $billing = $data->billing;

        return $api + [
            'addresses' => array_map(static fn (Address $a): array => $a->toArray(), $data->addresses),
            'billing_profile' => $billing === null ? null : [
                'legal_name' => $billing->legalName,
                'tax_regime' => $this->refs['tax_regime'] ?? null,
                'payment_method' => $this->refs['payment_method'] ?? null,
                'credit_days' => $billing->creditDays,
                'credit_limit' => $billing->creditLimit,
            ],
            'sellers' => $this->sellers,
            'contacts' => $this->contacts ?? [],
        ];
    }
}
