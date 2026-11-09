<?php

declare(strict_types=1);

namespace Soltec\Modules\Tasks\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/** A task: something the owner asked the assignee to do by a date. */
final class TaskRecord
{
    public function __construct(
        public readonly string $id,
        public readonly TaskData $data,
        public readonly string $taskTypeName,
        public readonly string $ownerId,
        public readonly string $ownerName,
        public readonly string $assigneeName,
        public readonly string $stateId,
        public readonly string $stateName,
        public readonly string $stateColor,
        public readonly bool $stateIsTerminal,
        public readonly ?string $proposedDueDate,
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

    /**
     * @param list<array{id: string, name: string, color: string}>|null $nextStates the states the reader may move the
     *     task to; null in lists, where it is not computed
     * @return array<string, mixed> the `Task` schema of the contract
     */
    public function toApi(?array $nextStates = null): array
    {
        $task = [
            'id' => $this->id,
            'title' => $this->data->title,
            'description' => $this->data->description,
            'task_type' => ['id' => $this->data->taskTypeId, 'name' => $this->taskTypeName],
            'owner' => ['id' => $this->ownerId, 'name' => $this->ownerName],
            'assignee' => ['id' => $this->data->assigneeId, 'name' => $this->assigneeName],
            'due_date' => $this->data->dueDate,
            'proposed_due_date' => $this->proposedDueDate,
            'state' => [
                'id' => $this->stateId,
                'name' => $this->stateName,
                'color' => $this->stateColor,
                'is_terminal' => $this->stateIsTerminal,
            ],
            'is_active' => $this->isActive(),
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
        if ($nextStates !== null) {
            $task['next_states'] = $nextStates;
        }

        return $task;
    }
}
