<?php

declare(strict_types=1);

namespace Soltec\Modules\Tasks\Domain;

/** What a person types to create or change a task. The due date is a calendar date (`YYYY-MM-DD`), without a time. */
final class TaskData
{
    public function __construct(
        public readonly string $title,
        public readonly ?string $description,
        public readonly string $taskTypeId,
        public readonly string $assigneeId,
        public readonly string $dueDate,
    ) {
    }

    /** @return array<string, string|null> */
    public function toArray(): array
    {
        return [
            'title' => $this->title,
            'description' => $this->description,
            'task_type_id' => $this->taskTypeId,
            'assignee_id' => $this->assigneeId,
            'due_date' => $this->dueDate,
        ];
    }
}
