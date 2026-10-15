<?php

declare(strict_types=1);

namespace Soltec\Modules\Clients\Domain;

use Soltec\Kernel\Address;

/**
 * What a person enters about a client. `identification` is canonical (see {@see \Soltec\Kernel\Identification}) and
 * null for the type `none`. `billing` is null for a prospect.
 */
final class ClientData
{
    /** @param list<Address> $addresses */
    public function __construct(
        public readonly string $name,
        public readonly string $identificationType,
        public readonly ?string $identification,
        public readonly ?string $statusId,
        public readonly ?string $segmentId,
        public readonly ?string $areaId,
        public readonly ?string $marginLevelId,
        public readonly array $addresses,
        public readonly ?BillingProfile $billing,
    ) {
    }

    /** @return array<string, mixed> the fields as the audit log records them */
    public function toArray(): array
    {
        return [
            'name' => $this->name,
            'identification_type' => $this->identificationType,
            'identification' => $this->identification,
            'status_id' => $this->statusId,
            'segment_id' => $this->segmentId,
            'area_id' => $this->areaId,
            'margin_level_id' => $this->marginLevelId,
            'addresses' => array_map(static fn (Address $a): array => $a->toArray(), $this->addresses),
            'billing_profile' => $this->billing?->toArray(),
        ];
    }

    public function withIdentification(string $type, ?string $identification): self
    {
        return new self(
            $this->name,
            $type,
            $identification,
            $this->statusId,
            $this->segmentId,
            $this->areaId,
            $this->marginLevelId,
            $this->addresses,
            $this->billing,
        );
    }
}
