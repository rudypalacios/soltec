<?php

declare(strict_types=1);

namespace Soltec\Modules\Workflow\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/** A state of a flow with the states it may move to (only the active ones). */
final class WorkflowStateRecord
{
    /** @param list<string> $transitionsTo ids of the active states a record in this state may move to */
    public function __construct(
        public readonly string $id,
        public readonly WorkflowCode $workflow,
        public readonly string $name,
        public readonly string $color,
        public readonly int $sortOrder,
        public readonly bool $isInitial,
        public readonly bool $isTerminal,
        public readonly array $transitionsTo,
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

    /** @return array<string, mixed> the `WorkflowState` schema of the contract */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'workflow' => $this->workflow->value,
            'name' => $this->name,
            'color' => $this->color,
            'sort_order' => $this->sortOrder,
            'is_initial' => $this->isInitial,
            'is_terminal' => $this->isTerminal,
            'transitions_to' => $this->transitionsTo,
            'is_active' => $this->isActive(),
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
    }
}
