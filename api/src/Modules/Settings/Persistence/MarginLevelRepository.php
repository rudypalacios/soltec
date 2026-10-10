<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Settings\Domain\MarginLevelRecord;

/** Reads and writes `margin_levels`. Ids cross the database as hex (see Uuid). */
final class MarginLevelRepository
{
    private const COLUMNS = 'LOWER(HEX(id)) AS id, name, rate, is_default, sort_order, created_at, updated_at, '
        . 'version, deleted_at';

    public function __construct(private readonly Connection $connection)
    {
    }

    public function find(string $id): ?MarginLevelRecord
    {
        $row = $this->connection->fetchAssociative(
            'SELECT ' . self::COLUMNS . ' FROM margin_levels WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($id)],
        );

        return $row === false ? null : $this->hydrate($row);
    }

    /** The active default level, which the unique index keeps at one; null only if the seed was removed by hand. */
    public function findDefault(): ?MarginLevelRecord
    {
        $row = $this->connection->fetchAssociative(
            'SELECT ' . self::COLUMNS . ' FROM margin_levels WHERE default_marker = 1',
        );

        return $row === false ? null : $this->hydrate($row);
    }

    /**
     * Locks every level until the end of the transaction. There are a handful of rows, and the changes that move the
     * default (set it, deactivate it) must wait for each other or two of them could leave no default or two.
     */
    public function lockAll(): void
    {
        $this->connection->fetchFirstColumn('SELECT id FROM margin_levels ORDER BY id FOR UPDATE');
    }

    /**
     * @param string $status active, inactive or all
     * @return list<MarginLevelRecord>
     */
    public function all(string $status): array
    {
        $where = match ($status) {
            'active' => ' WHERE deleted_at IS NULL',
            'inactive' => ' WHERE deleted_at IS NOT NULL',
            default => '',
        };
        $rows = $this->connection->fetchAllAssociative(
            'SELECT ' . self::COLUMNS . ' FROM margin_levels' . $where . ' ORDER BY sort_order, rate, id',
        );

        return array_map($this->hydrate(...), $rows);
    }

    public function nextSortOrder(): int
    {
        $max = $this->connection->fetchOne('SELECT MAX(sort_order) FROM margin_levels');

        return min(65535, (is_numeric($max) ? (int) $max : 0) + 1);
    }

    public function insert(string $id, string $name, string $rate, int $sortOrder, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'INSERT INTO margin_levels (id, name, rate, sort_order, created_at, updated_at) '
            . 'VALUES (UNHEX(:id), :name, :rate, :sort_order, :now, :now)',
            [
                'id' => Uuid::toHex($id),
                'name' => $name,
                'rate' => $rate,
                'sort_order' => $sortOrder,
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /** @return bool false when the version is stale or the level does not exist */
    public function update(string $id, int $version, string $name, string $rate, DateTimeImmutable $now): bool
    {
        return $this->connection->executeStatement(
            'UPDATE margin_levels SET name = :name, rate = :rate, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id) AND version = :version',
            [
                'id' => Uuid::toHex($id),
                'version' => $version,
                'name' => $name,
                'rate' => $rate,
                'now' => Timestamps::toDb($now),
            ],
        ) === 1;
    }

    public function setDefault(string $id, bool $isDefault, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE margin_levels SET is_default = :is_default, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($id), 'is_default' => (int) $isDefault, 'now' => Timestamps::toDb($now)],
        );
    }

    /** Deactivates (a date) or reactivates (null). */
    public function setDeletedAt(string $id, ?DateTimeImmutable $deletedAt, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE margin_levels SET deleted_at = :deleted_at, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id)',
            [
                'id' => Uuid::toHex($id),
                'deleted_at' => $deletedAt === null ? null : Timestamps::toDb($deletedAt),
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): MarginLevelRecord
    {
        return new MarginLevelRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            Row::string($row, 'name'),
            Row::string($row, 'rate'),
            Row::int($row, 'is_default') === 1,
            Row::int($row, 'sort_order'),
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
            Row::nullableDate($row, 'deleted_at'),
        );
    }
}
