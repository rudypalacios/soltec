<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 2.2 (catalog structure): brands, areas, product groups, unit categories and units of measure, their starting
 * values and one permission resource each, granted to `admin` (ADR-0016, ADR-0024). Groups belong to an area and units
 * to a category; `name` is unique among active rows through a generated column (the collation ignores case and
 * accents), within the area for groups and across the table for units.
 *
 * The resources have no data scope. Idempotent, so a half-applied run can continue; it uses no application class
 * because the deployment applies migrations before it uploads the new code.
 */
final class CreateCatalogStructureTables extends AbstractMigration
{
    private const TABLE_OPTIONS = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    /** table => resource name shown in the permission matrix */
    private const RESOURCES = [
        'brands' => 'Marcas',
        'areas' => 'Áreas',
        'product_groups' => 'Grupos de producto',
        'unit_categories' => 'Categorías de unidad',
        'units_of_measure' => 'Unidades de medida',
    ];

    private const AREAS = ['Aire Acondicionado', 'Electricidad', 'Cableado', 'Equipo', 'Otros'];

    /** category => units; no conversions between them */
    private const UNITS = [
        'Cantidad' => ['Unidad', 'Par', 'Caja', 'Rollo'],
        'Longitud' => ['Metro', 'Centímetro', 'Milímetro', 'Pulgada', 'Pie'],
        'Peso' => ['Kilogramo', 'Gramo', 'Libra', 'Onza'],
        'Volumen' => ['Litro', 'Mililitro', 'Galón'],
        'Superficie' => ['Metro cuadrado'],
    ];

    public function up(): void
    {
        $this->createFlatTable('brands', 100);
        $this->createFlatTable('areas', 100);
        $this->createFlatTable('unit_categories', 60);
        $this->createChildTable('product_groups', 'area_id', 'areas', 100, 'uq_product_groups_area_active_name');
        $this->createChildTable(
            'units_of_measure',
            'category_id',
            'unit_categories',
            60,
            'uq_units_of_measure_active_name',
        );

        foreach (self::AREAS as $name) {
            $this->execute($this->seedFlat('areas', $name));
        }
        foreach (self::UNITS as $category => $units) {
            $this->execute($this->seedFlat('unit_categories', $category));
            foreach ($units as $unit) {
                $this->execute($this->seedUnit($category, $unit));
            }
        }

        foreach (self::RESOURCES as $code => $name) {
            $this->execute(sprintf("INSERT IGNORE INTO resources (code, name) VALUES ('%s', '%s')", $code, $name));
            $this->execute(
                'INSERT IGNORE INTO role_permissions (role_id, resource_code, permission_code) '
                . sprintf("SELECT r.id, '%s', p.code FROM roles r CROSS JOIN permissions p ", $code)
                . "WHERE r.code = 'admin' AND p.code IN ('view', 'create', 'edit', 'deactivate')",
            );
        }
    }

    public function down(): void
    {
        foreach (array_reverse(array_keys(self::RESOURCES)) as $table) {
            $this->execute(sprintf("DELETE FROM role_scopes WHERE resource_code = '%s'", $table));
            $this->execute(sprintf("DELETE FROM role_permissions WHERE resource_code = '%s'", $table));
            $this->execute(sprintf("DELETE FROM resources WHERE code = '%s'", $table));
            $this->execute(sprintf('DROP TABLE IF EXISTS %s', $table));
        }
    }

    private function createFlatTable(string $table, int $nameLength): void
    {
        $this->execute(
            sprintf('CREATE TABLE IF NOT EXISTS %s (', $table)
            . 'id BINARY(16) NOT NULL, '
            . sprintf('name VARCHAR(%d) NOT NULL, ', $nameLength)
            . sprintf(
                'active_name VARCHAR(%d) GENERATED ALWAYS AS (IF(deleted_at IS NULL, name, NULL)) STORED, ',
                $nameLength,
            )
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . sprintf('UNIQUE KEY uq_%s_active_name (active_name), ', $table)
            . sprintf('KEY idx_%s_updated (updated_at)', $table)
            . ')' . self::TABLE_OPTIONS,
        );
    }

    /**
     * A table whose rows belong to a parent. Groups repeat names across areas, so their unique index includes the
     * parent; units are unique in the whole table, so theirs does not.
     */
    private function createChildTable(
        string $table,
        string $parentColumn,
        string $parentTable,
        int $nameLength,
        string $uniqueName,
    ): void {
        $unique = $table === 'product_groups' ? sprintf('(%s, active_name)', $parentColumn) : '(active_name)';
        $this->execute(
            sprintf('CREATE TABLE IF NOT EXISTS %s (', $table)
            . 'id BINARY(16) NOT NULL, '
            . sprintf('%s BINARY(16) NOT NULL, ', $parentColumn)
            . sprintf('name VARCHAR(%d) NOT NULL, ', $nameLength)
            . sprintf(
                'active_name VARCHAR(%d) GENERATED ALWAYS AS (IF(deleted_at IS NULL, name, NULL)) STORED, ',
                $nameLength,
            )
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . sprintf('UNIQUE KEY %s %s, ', $uniqueName, $unique)
            . sprintf('KEY idx_%s_parent (%s), ', $table, $parentColumn)
            . sprintf('KEY idx_%s_updated (updated_at), ', $table)
            . sprintf(
                'CONSTRAINT fk_%s_parent FOREIGN KEY (%s) REFERENCES %s (id) ON DELETE RESTRICT ON UPDATE RESTRICT',
                $table,
                $parentColumn,
                $parentTable,
            )
            . ')' . self::TABLE_OPTIONS,
        );
    }

    private function seedFlat(string $table, string $name): string
    {
        return sprintf(
            "INSERT INTO %s (id, name, created_at, updated_at) SELECT UNHEX('%s'), '%s', UTC_TIMESTAMP(3), "
            . "UTC_TIMESTAMP(3) FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM %s WHERE name = '%s')",
            $table,
            $this->newUuidV7Hex(),
            $name,
            $table,
            $name,
        );
    }

    private function seedUnit(string $category, string $unit): string
    {
        return sprintf(
            "INSERT INTO units_of_measure (id, category_id, name, created_at, updated_at) SELECT UNHEX('%s'), c.id, "
            . "'%s', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3) FROM unit_categories c WHERE c.name = '%s' "
            . "AND NOT EXISTS (SELECT 1 FROM units_of_measure WHERE name = '%s')",
            $this->newUuidV7Hex(),
            $unit,
            $category,
            $unit,
        );
    }

    /** A UUID v7 as 32 hexadecimal characters, the same format as the application's Uuid class. */
    private function newUuidV7Hex(): string
    {
        $bytes = substr(pack('J', (int) floor(microtime(true) * 1000)), 2) . random_bytes(10);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x70);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);

        return bin2hex($bytes);
    }
}
