<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 2.1 (catalog parameters): the five lookup tables PM1, PM2, PM5, PM6 and PM7, their starting values and one
 * permission resource each, granted to `admin` (ADR-0016). All five have the same shape; `client_statuses` also
 * carries the `color` its badges are painted with, so changing it repaints every client in that status.
 *
 * `name` is unique among active rows through a generated column (the collation ignores case and accents). The
 * resources have no data scope. Idempotent, so a half-applied run can continue; it uses no application class
 * because the deployment applies migrations before it uploads the new code.
 */
final class CreateCatalogParametersTables extends AbstractMigration
{
    private const TABLE_OPTIONS = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    /** table => resource name shown in the permission matrix */
    private const RESOURCES = [
        'contact_types' => 'Tipos de contacto',
        'client_statuses' => 'Estados de cliente',
        'segments' => 'Segmentos',
        'tax_regimes' => 'Regímenes fiscales',
        'payment_methods' => 'Formas de pago',
    ];

    /** table => rows to start with; a row is [name] or [name, color] */
    private const SEED = [
        'contact_types' => [['Comercial'], ['Compras'], ['Facturación']],
        'client_statuses' => [
            ['Prospecto aprobado / por activar', '#0B6BB0'],
            ['Activo (nuevo)', '#00796B'],
            ['Activo (recurrente)', '#1E7A4C'],
            ['En riesgo / inactivo temporal', '#9A5800'],
            ['Inactivo / dormido', '#7C8996'],
            ['Perdido', '#B3261E'],
        ],
        'segments' => [
            ['Restaurantes'],
            ['Industria Manufacturera'],
            ['Departamentos/Interiorismo'],
            ['Construcción'],
            ['Finanzas'],
            ['Educación'],
            ['Servicios'],
            ['Retail'],
        ],
        'tax_regimes' => [['Pequeño contribuyente'], ['General']],
        'payment_methods' => [],
    ];

    public function up(): void
    {
        foreach (array_keys(self::RESOURCES) as $table) {
            $this->createTable($table);
            foreach (self::SEED[$table] as $row) {
                $this->seedRow($table, $row[0], $row[1] ?? null);
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
        foreach (array_keys(self::RESOURCES) as $table) {
            $this->execute(sprintf("DELETE FROM role_scopes WHERE resource_code = '%s'", $table));
            $this->execute(sprintf("DELETE FROM role_permissions WHERE resource_code = '%s'", $table));
            $this->execute(sprintf("DELETE FROM resources WHERE code = '%s'", $table));
            $this->execute(sprintf('DROP TABLE IF EXISTS %s', $table));
        }
    }

    private function createTable(string $table): void
    {
        $color = $table === 'client_statuses' ? 'color CHAR(7) NOT NULL, ' : '';
        $this->execute(
            sprintf('CREATE TABLE IF NOT EXISTS %s (', $table)
            . 'id BINARY(16) NOT NULL, '
            . 'name VARCHAR(100) NOT NULL, '
            . 'active_name VARCHAR(100) GENERATED ALWAYS AS (IF(deleted_at IS NULL, name, NULL)) STORED, '
            . $color
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

    private function seedRow(string $table, string $name, ?string $color): void
    {
        $columns = $color === null ? 'id, name, created_at, updated_at' : 'id, name, color, created_at, updated_at';
        $values = "UNHEX('" . $this->newUuidV7Hex() . "'), '" . $name . "', "
            . ($color === null ? '' : "'" . $color . "', ")
            . 'UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)';
        $this->execute(sprintf(
            "INSERT INTO %s (%s) SELECT %s FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM %s WHERE name = '%s')",
            $table,
            $columns,
            $values,
            $table,
            $name,
        ));
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
