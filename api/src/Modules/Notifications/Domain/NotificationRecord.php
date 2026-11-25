<?php

declare(strict_types=1);

namespace Soltec\Modules\Notifications\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/** A notice for one person: what happened, to which record, who did it, and whether it was read. */
final class NotificationRecord
{
    /**
     * @param array<string, mixed> $data what the web needs to write the sentence (state names, dates)
     * @param array{id: string, name: string}|null $actor null for a reminder
     */
    public function __construct(
        public readonly string $id,
        public readonly NotificationType $type,
        public readonly string $subjectType,
        public readonly string $subjectId,
        public readonly string $subjectTitle,
        public readonly ?array $actor,
        public readonly array $data,
        public readonly ?DateTimeImmutable $readAt,
        public readonly DateTimeImmutable $createdAt,
    ) {
    }

    public function isRead(): bool
    {
        return $this->readAt !== null;
    }

    /** @return array<string, mixed> the `Notification` schema of the contract */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type->value,
            'subject' => ['type' => $this->subjectType, 'id' => $this->subjectId, 'title' => $this->subjectTitle],
            'actor' => $this->actor,
            'data' => (object) $this->data,
            'is_read' => $this->isRead(),
            'read_at' => Timestamps::toIsoOrNull($this->readAt),
            'created_at' => Timestamps::toIso($this->createdAt),
        ];
    }
}
