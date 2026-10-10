<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/**
 * A margin level (MC): the share of the selling price that is margin, as a decimal string ("0.33000"), never a
 * float because prices are computed from it (ADR-0011).
 */
final class MarginLevelRecord
{
    public function __construct(
        public readonly string $id,
        public readonly string $name,
        public readonly string $rate,
        public readonly bool $isDefault,
        public readonly int $sortOrder,
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

    /** @return array<string, mixed> the `MarginLevel` schema of the contract */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'rate' => $this->rate,
            'is_default' => $this->isDefault,
            'sort_order' => $this->sortOrder,
            'is_active' => $this->isActive(),
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
    }
}
