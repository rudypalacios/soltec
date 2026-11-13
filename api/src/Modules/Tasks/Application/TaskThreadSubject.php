<?php

declare(strict_types=1);

namespace Soltec\Modules\Tasks\Application;

use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Modules\Tasks\Persistence\TaskRepository;
use Soltec\Modules\Thread\Domain\ThreadSubject;

/**
 * The thread of a task is seen by whoever sees the task: its owner, its assignee, whoever was mentioned in it and
 * whoever the permission and the data scope reach.
 */
final class TaskThreadSubject implements ThreadSubject
{
    public function __construct(private readonly TaskRepository $tasks)
    {
    }

    public function type(): string
    {
        return TaskService::THREAD;
    }

    public function canSee(CurrentUser $user, string $subjectId): bool
    {
        return $this->tasks->find($subjectId, $user) !== null;
    }
}
