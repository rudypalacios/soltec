<?php

declare(strict_types=1);

namespace Soltec\Modules\Suppliers\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/** A stored supplier. A list carries no addresses or contacts (`detailed` false); a single read carries them. */
final class SupplierRecord
{
    public function __construct(
        public readonly string $id,
        public readonly string $code,
        public readonly SupplierData $data,
        public readonly bool $detailed,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $updatedAt,
        public readonly int $version,
        public readonly ?DateTimeImmutable $deletedAt,
    ) {
    }

    public function isActive(): bool
    {
        return $this->deletedAt === null;
    }

    /** @return array<string, mixed> the `Supplier` (or `SupplierSummary`) schema of the contract */
    public function toApi(): array
    {
        $data = $this->data;
        $identification = $data->identification === null
            ? null
            : Identification::display($data->identificationType, $data->identification);
        $api = [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $data->name,
            'legal_name' => $data->legalName,
            'identification_type' => $data->identificationType,
            'identification' => $identification,
            'credit_days' => $data->creditDays,
            'credit_limit' => $data->creditLimit,
            'is_active' => $this->isActive(),
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
        if ($this->detailed) {
            $api['addresses'] = array_map(static fn (SupplierAddress $a): array => $a->toArray(), $data->addresses);
            $api['contacts'] = array_map(static fn (SupplierContact $c): array => $c->toApi(), $data->contacts);
        }

        return $api;
    }
}
