<?php

declare(strict_types=1);

namespace Soltec\Modules\Catalog\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/** A value of a catalog parameter. `color` is set only for parameters that have one (client statuses). */
final class ParameterRecord
{
    public function __construct(
        public readonly string $id,
        public readonly string $name,
        public readonly ?string $color,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $updatedAt,
        public readonly int $version,
        public readonly ?DateTimeImmutable $deletedAt,
        public readonly ?string $parentId = null,
        /** @var array<string, mixed> members of the list's own shape: the named parent, the count of active children */
        public readonly array $extra = [],
    ) {
    }

    public function isActive(): bool
    {
        return $this->deletedAt === null;
    }

    /** @return array<string, mixed> the schema of the parameter in the contract */
    public function toApi(): array
    {
        $data = [
            'id' => $this->id,
            'name' => $this->name,
            'is_active' => $this->isActive(),
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
        if ($this->color !== null) {
            $data['color'] = $this->color;
        }

        return $data + $this->extra;
    }
}
