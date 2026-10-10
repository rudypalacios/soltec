<?php

declare(strict_types=1);

namespace Soltec\Modules\Organization\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/** A department with the number of active users in it. The direct manager lives in each user, not here. */
final class DepartmentRecord
{
    public function __construct(
        public readonly string $id,
        public readonly string $name,
        public readonly int $activeUserCount,
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

    /** @return array<string, mixed> the `Department` schema of the contract */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'is_active' => $this->isActive(),
            'active_user_count' => $this->activeUserCount,
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
    }
}
