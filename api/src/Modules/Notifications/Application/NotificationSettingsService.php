<?php

declare(strict_types=1);

namespace Soltec\Modules\Notifications\Application;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Notifications\Domain\NotificationSettingsRecord;
use Soltec\Modules\Notifications\Persistence\NotificationSettingsRepository;

/** The one thing about notifications an administrator sets: the hour from which the due-date reminders go out. */
final class NotificationSettingsService
{
    private const ENTITY = 'notification_settings';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly NotificationSettingsRepository $settings,
        private readonly AuditLogger $audit,
    ) {
    }

    public function get(): NotificationSettingsRecord
    {
        return $this->settings->get();
    }

    /** @throws ApiException 409 `conflict` when the version is stale */
    public function update(ActorContext $actor, int $version, int $dueReminderHour): NotificationSettingsRecord
    {
        $this->connection->transactional(function () use ($actor, $version, $dueReminderHour): void {
            $current = $this->settings->get(lock: true);
            if ($current->version !== $version) {
                throw ApiException::conflict();
            }
            if ($current->dueReminderHour === $dueReminderHour) {
                return;
            }

            $this->settings->update($dueReminderHour, $version, $this->clock->now());
            $this->audit->record(
                $actor,
                'update',
                self::ENTITY,
                $current->id,
                ['due_reminder_hour' => $current->dueReminderHour],
                ['due_reminder_hour' => $dueReminderHour],
            );
        });

        return $this->settings->get();
    }
}
