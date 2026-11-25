<?php

declare(strict_types=1);

namespace Soltec\Modules\Tasks\Application;

use DateTimeImmutable;
use Soltec\Kernel\Clock;
use Soltec\Modules\Notifications\Application\NotificationService;
use Soltec\Modules\Notifications\Application\ScheduledReminders;
use Soltec\Modules\Notifications\Domain\NotificationType;
use Soltec\Modules\Tasks\Persistence\TaskRepository;

/**
 * The reminders of tasks: the day before the due date ("due tomorrow") and after it passed ("overdue"). Both go to the
 * owner and the assignee of a task that is still open and active. An overdue notice is only for tasks that fell due in
 * the last {@see OVERDUE_DAYS} days, so the first run on an instance with old tasks does not flood anyone. Each person
 * is told once per task and due date (the dedupe key), so running every hour is harmless, and a new due date makes a
 * new reminder possible.
 */
final class TaskDueReminders implements ScheduledReminders
{
    public const OVERDUE_DAYS = 7;

    public function __construct(
        private readonly Clock $clock,
        private readonly TaskRepository $tasks,
        private readonly NotificationService $notifications,
    ) {
    }

    public function run(string $today): int
    {
        $now = $this->clock->now();
        $day = new DateTimeImmutable($today);
        $tomorrow = $day->modify('+1 day')->format('Y-m-d');
        $oldest = $day->modify('-' . self::OVERDUE_DAYS . ' days')->format('Y-m-d');
        $yesterday = $day->modify('-1 day')->format('Y-m-d');

        $written = 0;
        foreach ($this->tasks->openDueBetween($oldest, $tomorrow) as $task) {
            $type = match (true) {
                $task['due_date'] === $tomorrow => NotificationType::DueSoon,
                $task['due_date'] <= $yesterday => NotificationType::Overdue,
                default => null, // due today: told yesterday, and not yet late
            };
            if ($type === null) {
                continue;
            }
            $written += count($this->notifications->publish(
                $type,
                [$task['owner_id'], $task['assignee_id']],
                null,
                TaskService::THREAD,
                $task['id'],
                $task['title'],
                ['due_date' => $task['due_date']],
                $now,
                dedupeBase: sprintf('%s:%s:%s', $type->value, $task['id'], $task['due_date']),
            ));
        }

        return $written;
    }
}
