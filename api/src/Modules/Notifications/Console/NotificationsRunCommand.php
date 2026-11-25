<?php

declare(strict_types=1);

namespace Soltec\Modules\Notifications\Console;

use Soltec\Modules\Access\Console\ConsoleIo;
use Soltec\Modules\Notifications\Application\NotificationRun;

/**
 * `php api/bin/console notifications:run`: the job the hosting's cron runs every hour (docs/despliegue.md). It creates
 * the due-date reminders from the hour set in the settings and sends the emails still pending.
 */
final class NotificationsRunCommand
{
    public const NAME = 'notifications:run';

    public function __construct(private readonly NotificationRun $run)
    {
    }

    /** @return int the process exit code: 0 on success, 1 when some email could not be sent */
    public function run(ConsoleIo $io): int
    {
        $result = $this->run->run();
        $io->writeLine(sprintf(
            'Reminders: %d created%s. Emails: %d sent, %d failed.',
            $result['reminders'],
            $result['reminded'] ? '' : ' (before the reminder hour)',
            $result['sent'],
            $result['failed'],
        ));

        return $result['failed'] === 0 ? 0 : 1;
    }
}
