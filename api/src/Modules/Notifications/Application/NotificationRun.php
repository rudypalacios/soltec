<?php

declare(strict_types=1);

namespace Soltec\Modules\Notifications\Application;

use DateTimeImmutable;
use DateTimeZone;
use Soltec\Kernel\Clock;
use Soltec\Modules\Notifications\Persistence\NotificationSettingsRepository;
use Soltec\Modules\Settings\Persistence\CompanyRepository;

/**
 * What the hourly job of the hosting does (`php api/bin/console notifications:run`): from the hour set in the settings,
 * in the company's time zone, create the due-date reminders; then send the emails still pending; then note the run so
 * the requirements check can tell if the job stopped. The reminders may run on every call of that hour and after:
 * their dedupe key stops a repeat.
 */
final class NotificationRun
{
    public function __construct(
        private readonly Clock $clock,
        private readonly ScheduledReminders $reminders,
        private readonly NotificationMailer $mailer,
        private readonly NotificationSettingsRepository $settings,
        private readonly CompanyRepository $company,
    ) {
    }

    /** @return array{reminders: int, sent: int, failed: int, reminded: bool} */
    public function run(): array
    {
        $now = $this->clock->now();
        $settings = $this->settings->get();
        $local = $now->setTimezone(new DateTimeZone($this->company->get()->timezone));

        $reminded = $this->isReminderHour($local, $settings->dueReminderHour);
        $created = $reminded ? $this->reminders->run($local->format('Y-m-d')) : 0;
        $emails = $this->mailer->deliver();
        $this->settings->markRun($now);

        return [
            'reminders' => $created,
            'sent' => $emails['sent'],
            'failed' => $emails['failed'],
            'reminded' => $reminded,
        ];
    }

    /** From the set hour to the end of that day: a run that was late still creates the day's reminders. */
    private function isReminderHour(DateTimeImmutable $local, int $hour): bool
    {
        return (int) $local->format('G') >= $hour;
    }
}
