<?php

declare(strict_types=1);

namespace Soltec\Modules\Notifications\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use LogicException;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Notifications\Domain\NotificationSettingsRecord;

/** Reads and writes the single row of `notification_settings`. */
final class NotificationSettingsRepository
{
    private const COLUMNS = 'LOWER(HEX(id)) AS id, due_reminder_hour, last_run_at, created_at, updated_at, version';

    public function __construct(private readonly Connection $connection)
    {
    }

    /** @throws LogicException when the migration that seeds the row did not run */
    public function get(bool $lock = false): NotificationSettingsRecord
    {
        $row = $this->connection->fetchAssociative(
            'SELECT ' . self::COLUMNS . ' FROM notification_settings' . ($lock ? ' FOR UPDATE' : ''),
        );
        if ($row === false) {
            throw new LogicException('The notification settings row is missing: run the migrations.');
        }

        return new NotificationSettingsRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            Row::int($row, 'due_reminder_hour'),
            Row::nullableDate($row, 'last_run_at'),
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
        );
    }

    /** @return bool false when the version is stale */
    public function update(int $dueReminderHour, int $version, DateTimeImmutable $now): bool
    {
        return $this->connection->executeStatement(
            'UPDATE notification_settings SET due_reminder_hour = :hour, updated_at = :now, version = version + 1 '
            . 'WHERE version = :version',
            ['hour' => $dueReminderHour, 'now' => Timestamps::toDb($now), 'version' => $version],
        ) === 1;
    }

    /** Marks that the scheduled command ran. Not a change of settings: it leaves `version` and `updated_at` alone. */
    public function markRun(DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE notification_settings SET last_run_at = :now',
            ['now' => Timestamps::toDb($now)],
        );
    }
}
