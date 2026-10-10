<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use LogicException;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Settings\Domain\FinancialSettingsRecord;

/** Reads and writes the single row of `financial_settings`. */
final class FinancialSettingsRepository
{
    private const COLUMNS = 'LOWER(HEX(id)) AS id, currency_code, vat_rate, income_tax_rate, stale_cost_days, '
        . 'quote_validity_days, created_at, updated_at, version';

    public function __construct(private readonly Connection $connection)
    {
    }

    /** @throws LogicException when the migration that seeds the row did not run */
    public function get(bool $lock = false): FinancialSettingsRecord
    {
        $row = $this->connection->fetchAssociative(
            'SELECT ' . self::COLUMNS . ' FROM financial_settings' . ($lock ? ' FOR UPDATE' : ''),
        );
        if ($row === false) {
            throw new LogicException('The financial settings row is missing: run the migrations.');
        }

        return new FinancialSettingsRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            Row::string($row, 'currency_code'),
            Row::string($row, 'vat_rate'),
            Row::string($row, 'income_tax_rate'),
            Row::int($row, 'stale_cost_days'),
            Row::int($row, 'quote_validity_days'),
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
        );
    }

    /** @return bool false when the version is stale */
    public function update(
        string $vatRate,
        string $incomeTaxRate,
        int $staleCostDays,
        int $quoteValidityDays,
        int $version,
        DateTimeImmutable $now,
    ): bool {
        return $this->connection->executeStatement(
            'UPDATE financial_settings SET vat_rate = :vat, income_tax_rate = :isr, stale_cost_days = :stale, '
            . 'quote_validity_days = :validity, updated_at = :now, version = version + 1 WHERE version = :version',
            [
                'vat' => $vatRate,
                'isr' => $incomeTaxRate,
                'stale' => $staleCostDays,
                'validity' => $quoteValidityDays,
                'now' => Timestamps::toDb($now),
                'version' => $version,
            ],
        ) === 1;
    }
}
