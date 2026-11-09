<?php

declare(strict_types=1);

namespace Soltec\Modules\Files\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/** A photo the system keeps: its description and where its two WebP files are (never exposed to the API). */
final class FileRecord
{
    public function __construct(
        public readonly string $id,
        public readonly string $uploadedBy,
        public readonly string $uploadedByName,
        public readonly string $originalName,
        public readonly int $width,
        public readonly int $height,
        public readonly int $sizeBytes,
        public readonly string $contentHash,
        public readonly string $normalPath,
        public readonly string $thumbnailPath,
        public readonly PhotoMetadata $metadata,
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

    /** @return array<string, mixed> the `File` schema of the contract */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'original_name' => $this->originalName,
            'width' => $this->width,
            'height' => $this->height,
            'size_bytes' => $this->sizeBytes,
            'metadata' => $this->metadata->isEmpty() ? null : $this->metadata->toArray(),
            'uploaded_by' => ['id' => $this->uploadedBy, 'name' => $this->uploadedByName],
            'is_active' => $this->isActive(),
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
    }
}
