<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use LogicException;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Domain\SecuritySettingsRecord;

/**
 * Reads and writes the single row of `security_settings`. A read without lock is remembered for the rest of the
 * request: login and refresh ask for the parameters several times and a request is short.
 */
final class SecuritySettingsRepository
{
    private const COLUMNS = 'LOWER(HEX(id)) AS id, web_idle_minutes, mobile_refresh_days, max_failed_attempts, '
        . 'lockout_minutes, password_expiry_days, password_min_length, created_at, updated_at, version';

    private ?SecuritySettingsRecord $remembered = null;

    public function __construct(private readonly Connection $connection)
    {
    }

    /** @throws LogicException when the migration that seeds the row did not run */
    public function get(bool $lock = false): SecuritySettingsRecord
    {
        if (!$lock && $this->remembered !== null) {
            return $this->remembered;
        }

        $row = $this->connection->fetchAssociative(
            'SELECT ' . self::COLUMNS . ' FROM security_settings' . ($lock ? ' FOR UPDATE' : ''),
        );
        if ($row === false) {
            throw new LogicException('The security settings row is missing: run the migrations.');
        }

        $record = new SecuritySettingsRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            Row::int($row, 'web_idle_minutes'),
            Row::int($row, 'mobile_refresh_days'),
            Row::int($row, 'max_failed_attempts'),
            Row::int($row, 'lockout_minutes'),
            Row::int($row, 'password_expiry_days'),
            Row::int($row, 'password_min_length'),
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
        );
        $this->remembered = $lock ? null : $record;

        return $record;
    }

    /**
     * @param array<string, int> $values column => new value, only the parameters of SecuritySettingsRecord::LIMITS
     * @return bool false when the version is stale
     */
    public function update(array $values, int $version, DateTimeImmutable $now): bool
    {
        $sets = [];
        $params = ['now' => Timestamps::toDb($now), 'version' => $version];
        foreach ($values as $column => $value) {
            if (!array_key_exists($column, SecuritySettingsRecord::LIMITS)) {
                throw new LogicException(sprintf('"%s" is not a security parameter.', $column));
            }
            $sets[] = $column . ' = :' . $column;
            $params[$column] = $value;
        }
        $this->remembered = null;

        return $this->connection->executeStatement(
            'UPDATE security_settings SET ' . implode(', ', $sets)
            . ', updated_at = :now, version = version + 1 WHERE version = :version',
            $params,
        ) === 1;
    }
}
