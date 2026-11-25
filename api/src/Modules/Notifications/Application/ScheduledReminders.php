<?php

declare(strict_types=1);

namespace Soltec\Modules\Notifications\Application;

/**
 * A module's reminders that nobody's request causes (a task that is due tomorrow). `notifications:run` calls each one
 * every hour; publishing with a dedupe key makes running again harmless.
 */
interface ScheduledReminders
{
    /**
     * @param string $today the date today in the company's time zone (`Y-m-d`)
     * @return int how many notices were written
     */
    public function run(string $today): int;
}
