<?php

declare(strict_types=1);

namespace Soltec\Modules\Tasks\Application;

use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Modules\Access\Persistence\PermissionLoader;
use Soltec\Modules\Tasks\Persistence\TaskRepository;
use Soltec\Modules\Thread\Domain\ThreadSubject;

/** The thread of a task is seen by whoever sees the task: its owner, its assignee and whoever the scope reaches. */
final class TaskThreadSubject implements ThreadSubject
{
    /** A user loaded only to ask what they can see has no device. */
    private const NO_DEVICE = '00000000-0000-0000-0000-000000000000';

    public function __construct(private readonly TaskRepository $tasks, private readonly PermissionLoader $loader)
    {
    }

    public function type(): string
    {
        return TaskService::THREAD;
    }

    public function canSee(CurrentUser $user, string $subjectId): bool
    {
        return $user->can(TaskRepository::RESOURCE, 'view') && $this->tasks->find($subjectId, $user) !== null;
    }

    public function whoCanSee(string $subjectId, array $userIds): array
    {
        $reach = [];
        foreach ($userIds as $userId) {
            $user = $this->loader->build($userId, self::NO_DEVICE, false);
            if ($user !== null && $this->canSee($user, $subjectId)) {
                $reach[] = $userId;
            }
        }

        return $reach;
    }
}
