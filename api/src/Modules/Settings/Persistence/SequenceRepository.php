<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use LogicException;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Modules\Settings\Domain\SequenceRecord;

/** Reads and writes `sequences`. */
final class SequenceRepository
{
    private const COLUMNS = 'code, name, prefix, padding, period, period_key, next_value, created_at, updated_at, '
        . 'version';

    public function __construct(private readonly Connection $connection)
    {
    }

    /** @return list<SequenceRecord> */
    public function all(): array
    {
        $rows = $this->connection->fetchAllAssociative('SELECT ' . self::COLUMNS . ' FROM sequences ORDER BY name');

        return array_map($this->hydrate(...), $rows);
    }

    public function find(string $code, bool $lock = false): ?SequenceRecord
    {
        $row = $this->connection->fetchAssociative(
            'SELECT ' . self::COLUMNS . ' FROM sequences WHERE code = :code' . ($lock ? ' FOR UPDATE' : ''),
            ['code' => $code],
        );

        return $row === false ? null : $this->hydrate($row);
    }

    /** Saves the rule. The counter can only go up, and the caller has checked that under the row lock. */
    public function update(
        string $code,
        string $prefix,
        int $padding,
        string $period,
        int $nextValue,
        DateTimeImmutable $now,
    ): void {
        $this->connection->executeStatement(
            'UPDATE sequences SET prefix = :prefix, padding = :padding, period = :period, '
            . 'next_value = :next_value, updated_at = :now, version = version + 1 WHERE code = :code',
            [
                'code' => $code,
                'prefix' => $prefix,
                'padding' => $padding,
                'period' => $period,
                'next_value' => $nextValue,
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /**
     * Takes the next counter value in one statement, so two requests at the same instant get different numbers:
     * the UPDATE locks the row until the surrounding transaction ends. If the period changed since the last number
     * (a counter bound to a period, so not one the administrator only raised) it starts again at 1, inside the
     * same statement, so two requests at midnight cannot both get 1.
     * `LAST_INSERT_ID(expr)` hands back the value taken, per connection.
     *
     * Does not bump `version`: a document being issued must not make an administrator's open form stale.
     *
     * @return array{value: int, period_key: string|null}|null null when the sequence does not exist
     */
    public function take(string $code, string $yearKey, string $monthKey): ?array
    {
        $taken = $this->connection->executeStatement(
            'UPDATE sequences SET '
            . "next_value = LAST_INSERT_ID(IF(period = 'none' OR period_key IS NULL OR period_key = "
            . "IF(period = 'month', :month, :year), next_value, 1)) + 1, "
            . "period_key = IF(period = 'month', :month, IF(period = 'year', :year, NULL)) "
            . 'WHERE code = :code',
            ['code' => $code, 'year' => $yearKey, 'month' => $monthKey],
        );
        if ($taken === 0) {
            return null;
        }

        $value = $this->connection->fetchOne('SELECT LAST_INSERT_ID()');
        if (!is_numeric($value)) {
            throw new LogicException('MySQL did not return the number it just took.');
        }
        $periodKey = $this->connection->fetchOne('SELECT period_key FROM sequences WHERE code = :code', [
            'code' => $code,
        ]);

        return ['value' => (int) $value, 'period_key' => is_string($periodKey) ? $periodKey : null];
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): SequenceRecord
    {
        return new SequenceRecord(
            Row::string($row, 'code'),
            Row::string($row, 'name'),
            Row::string($row, 'prefix'),
            Row::int($row, 'padding'),
            Row::string($row, 'period'),
            Row::nullableString($row, 'period_key'),
            Row::int($row, 'next_value'),
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
        );
    }
}
