<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Notifications;

use Soltec\Kernel\DeferredTasks;
use Soltec\Modules\Notifications\Application\NotificationRun;
use Soltec\Modules\Notifications\Console\NotificationsRunCommand;
use Soltec\Tests\Support\CollectedTasks;
use Soltec\Tests\Support\ScriptedConsole;

/**
 * The hourly job: from the set hour (in the company's time zone, America/Guatemala, six hours behind UTC) a task due
 * tomorrow, or overdue within a week, tells its owner and its assignee once.
 */
final class DueRemindersTest extends NotificationsTestCase
{
    /**
     * The emails wait for the job, as they do when it runs from the hosting's cron: the job sends them itself and
     * reports how many.
     *
     * @return array<string, mixed>
     */
    protected function containerDefinitions(): array
    {
        $definitions = parent::containerDefinitions();
        $definitions[DeferredTasks::class] = new CollectedTasks();

        return $definitions;
    }

    /** 2026-10-09 12:00 UTC is 06:00 in Guatemala: before the default hour of 8. */
    public function testNothingIsCreatedBeforeTheHourButThePendingEmailsStillGoOut(): void
    {
        $this->newTask(['due_date' => '2026-10-10']);

        $result = $this->runJob();

        self::assertFalse($result['reminded']);
        self::assertSame(0, $result['reminders']);
        self::assertSame(['assigned'], $this->typesFor($this->assignee));
    }

    public function testATaskDueTomorrowTellsOwnerAndAssigneeOnceHoweverOftenItRuns(): void
    {
        $this->newTask(['due_date' => '2026-10-10']);
        $this->advance('+3 hours');

        $first = $this->runJob();
        $second = $this->runJob();

        self::assertTrue($first['reminded']);
        self::assertSame(2, $first['reminders']);
        self::assertSame(0, $second['reminders']);
        self::assertSame(['due_soon'], $this->typesFor($this->owner));
        self::assertSame(['due_soon', 'assigned'], $this->typesFor($this->assignee));
        $notice = $this->noticesFor($this->owner)[0];
        self::assertNull($notice['actor']);
        self::assertSame('2026-10-10', $this->text($notice, 'data', 'due_date'));
        $reminder = end($this->mail->sent);
        self::assertNotFalse($reminder);
        self::assertStringContainsString('vence mañana, el 10/10/2026', $reminder->body);
    }

    public function testOverdueIsOnlyForTheLastWeekAndNotForTodayOrClosedOrInactiveTasks(): void
    {
        $lastWeek = $this->text($this->newTask(['title' => 'Ayer', 'due_date' => '2026-10-08']), 'id');
        $this->newTask(['title' => 'Hoy', 'due_date' => '2026-10-09']);
        $this->newTask(['title' => 'Vieja', 'due_date' => '2026-09-01']);
        $closed = $this->text($this->newTask(['title' => 'Cerrada', 'due_date' => '2026-10-07']), 'id');
        foreach (['Aceptada', 'En ejecución', 'Completada'] as $state) {
            $this->moveTask($closed, $state);
        }
        $this->moveTask($closed, 'Cerrada', $this->owner['token']);
        $inactive = $this->text($this->newTask(['title' => 'Inactiva', 'due_date' => '2026-10-07']), 'id');
        $this->api('POST', '/tasks/' . $inactive . '/deactivate', $this->owner['token']);
        $this->advance('+3 hours');

        $this->runJob();

        $titles = array_map(
            fn (array $notice): string => $this->text($notice, 'subject', 'title'),
            array_values(array_filter(
                $this->noticesFor($this->owner),
                fn (array $notice): bool => $this->text($notice, 'type') === 'overdue',
            )),
        );
        self::assertSame(['Ayer'], $titles);
        self::assertSame($lastWeek, $this->text($this->noticesFor($this->owner)[0], 'subject', 'id'));
    }

    public function testAnotherDueDateMakesANewReminderPossible(): void
    {
        $id = $this->text($this->newTask(['due_date' => '2026-10-10']), 'id');
        $this->advance('+3 hours');
        $this->runJob();

        $this->editTask($id, ['due_date' => '2026-10-09']);
        $this->editTask($id, ['due_date' => '2026-10-10']);
        $this->runJob();

        self::assertSame(['due_soon'], $this->typesFor($this->owner));
    }

    public function testTheHourIsASettingAndTheRunIsNoted(): void
    {
        $this->newTask(['due_date' => '2026-10-10']);
        $this->advance('+3 hours');
        $this->connection->executeStatement('UPDATE notification_settings SET due_reminder_hour = 10');

        $result = $this->runJob();

        self::assertFalse($result['reminded']);
        self::assertNotNull($this->connection->fetchOne('SELECT last_run_at FROM notification_settings'));
    }

    public function testTheCommandReportsWhatItDid(): void
    {
        $this->newTask(['due_date' => '2026-10-10']);
        $this->advance('+3 hours');
        $io = new ScriptedConsole([], []);

        $code = $this->service(NotificationsRunCommand::class)->run($io);

        self::assertSame(0, $code);
        self::assertSame('Reminders: 2 created. Emails: 3 sent, 0 failed.', $io->output());
    }

    public function testTheCommandFailsWhenAnEmailCouldNotBeSent(): void
    {
        $this->newTask(['due_date' => '2026-10-10']);
        $this->advance('+3 hours');
        $this->mail->failWith(new \Soltec\Kernel\Mail\MailException('limit'));
        $io = new ScriptedConsole([], []);

        $code = $this->service(NotificationsRunCommand::class)->run($io);

        self::assertSame(1, $code);
        self::assertSame(3, $this->countRows("SELECT COUNT(*) FROM notifications WHERE email_status = 'failed'"));
    }

    /** @return array{reminders: int, sent: int, failed: int, reminded: bool} */
    private function runJob(): array
    {
        return $this->service(NotificationRun::class)->run();
    }
}
