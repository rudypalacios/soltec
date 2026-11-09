<?php

declare(strict_types=1);

namespace Soltec\Modules\Thread\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/**
 * One line of a thread: a comment a person wrote, or an event the system wrote (a change of state, of assignee or of
 * due date). Events are never edited.
 */
final class ThreadEntryRecord
{
    public const COMMENT = 'comment';
    public const EVENT = 'event';

    /**
     * @param array<string, mixed>|null $eventData
     * @param list<array{id: string, name: string}> $mentions
     * @param list<string> $fileIds
     */
    public function __construct(
        public readonly string $id,
        public readonly int $seq,
        public readonly string $subjectType,
        public readonly string $subjectId,
        public readonly string $kind,
        public readonly string $authorId,
        public readonly string $authorName,
        public readonly ?string $body,
        public readonly ?string $eventType,
        public readonly ?array $eventData,
        public readonly string $visibility,
        public readonly ?DateTimeImmutable $editedAt,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $updatedAt,
        public readonly int $version,
        public readonly ?DateTimeImmutable $deletedAt,
        public readonly array $mentions = [],
        public readonly array $fileIds = [],
    ) {
    }

    public function isComment(): bool
    {
        return $this->kind === self::COMMENT;
    }

    public function isActive(): bool
    {
        return $this->deletedAt === null;
    }

    /** @return array<string, mixed> the `ThreadEntry` schema of the contract */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'author' => ['id' => $this->authorId, 'name' => $this->authorName],
            'body' => $this->body,
            'event' => $this->eventType === null ? null : ['type' => $this->eventType, 'data' => $this->eventData],
            'visibility' => $this->visibility,
            'mentions' => $this->mentions,
            'file_ids' => $this->fileIds,
            'is_edited' => $this->editedAt !== null,
            'is_active' => $this->isActive(),
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
    }
}
