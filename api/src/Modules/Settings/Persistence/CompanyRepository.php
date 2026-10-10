<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use LogicException;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Settings\Domain\CompanyRecord;

/** Reads and writes the single row of `company`. */
final class CompanyRepository
{
    private const COLUMNS = 'LOWER(HEX(id)) AS id, legal_name, trade_name, tax_id, address, phone, email, timezone, '
        . 'logo_path, created_at, updated_at, version';

    public function __construct(private readonly Connection $connection)
    {
    }

    /** @throws LogicException when the migration that seeds the row did not run */
    public function get(bool $lock = false): CompanyRecord
    {
        $row = $this->connection->fetchAssociative(
            'SELECT ' . self::COLUMNS . ' FROM company' . ($lock ? ' FOR UPDATE' : ''),
        );
        if ($row === false) {
            throw new LogicException('The company row is missing: run the migrations.');
        }

        return new CompanyRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            Row::string($row, 'legal_name'),
            Row::string($row, 'trade_name'),
            Row::string($row, 'tax_id'),
            Row::nullableString($row, 'address'),
            Row::nullableString($row, 'phone'),
            Row::nullableString($row, 'email'),
            Row::string($row, 'timezone'),
            Row::nullableString($row, 'logo_path'),
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
        );
    }

    /** @return bool false when the version is stale */
    public function update(CompanyRecord $next, int $version, DateTimeImmutable $now): bool
    {
        return $this->connection->executeStatement(
            'UPDATE company SET legal_name = :legal_name, trade_name = :trade_name, tax_id = :tax_id, '
            . 'address = :address, phone = :phone, email = :email, timezone = :timezone, '
            . 'updated_at = :now, version = version + 1 WHERE version = :version',
            [
                'legal_name' => $next->legalName,
                'trade_name' => $next->tradeName,
                'tax_id' => $next->taxId,
                'address' => $next->address,
                'phone' => $next->phone,
                'email' => $next->email,
                'timezone' => $next->timezone,
                'now' => Timestamps::toDb($now),
                'version' => $version,
            ],
        ) === 1;
    }

    public function setLogoPath(?string $path, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE company SET logo_path = :path, updated_at = :now, version = version + 1',
            ['path' => $path, 'now' => Timestamps::toDb($now)],
        );
    }
}
