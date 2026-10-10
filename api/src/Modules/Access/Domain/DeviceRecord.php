<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/** A browser or phone where the user is signed in. */
final class DeviceRecord
{
    public function __construct(
        public readonly string $id,
        public readonly string $platform,
        public readonly ?string $name,
        public readonly ?DateTimeImmutable $lastSeenAt,
        public readonly DateTimeImmutable $createdAt,
        public readonly bool $current,
    ) {
    }

    /** @return array<string, mixed> the `Device` schema of the contract */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'platform' => $this->platform,
            'name' => $this->name,
            'last_seen_at' => Timestamps::toIsoOrNull($this->lastSeenAt),
            'created_at' => Timestamps::toIso($this->createdAt),
            'current' => $this->current,
        ];
    }
}
