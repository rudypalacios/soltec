<?php

declare(strict_types=1);

namespace Soltec\Modules\Contacts\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/** A person, owned by the user who entered them. */
final class ContactRecord
{
    public function __construct(
        public readonly string $id,
        public readonly string $code,
        public readonly ContactData $data,
        public readonly string $ownerId,
        public readonly string $ownerName,
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

    /** @return array<string, mixed> the `Contact` schema of the contract */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            ...$this->data->toArray(),
            'owner' => ['id' => $this->ownerId, 'name' => $this->ownerName],
            'is_active' => $this->isActive(),
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
    }
}
