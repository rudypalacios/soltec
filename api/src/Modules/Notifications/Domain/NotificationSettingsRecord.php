<?php

declare(strict_types=1);

namespace Soltec\Modules\Notifications\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/**
 * The only row of `notification_settings`: the local hour from which the due-date reminders go out, and when the
 * scheduled command last ran (so the requirements check can tell that the cron job is missing).
 */
final class NotificationSettingsRecord
{
    public function __construct(
        public readonly string $id,
        public readonly int $dueReminderHour,
        public readonly ?DateTimeImmutable $lastRunAt,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $updatedAt,
        public readonly int $version,
    ) {
    }

    /** @return array<string, mixed> the `NotificationSettings` schema of the contract */
    public function toApi(): array
    {
        return $this->auditData() + [
            'last_run_at' => Timestamps::toIsoOrNull($this->lastRunAt),
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
    }

    /** @return array<string, int> the fields an audit entry compares */
    public function auditData(): array
    {
        return ['due_reminder_hour' => $this->dueReminderHour];
    }
}
