<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 1.3 (general settings): the single-row `company` and `financial_settings` tables, the `sequences` table
 * behind the document numbers, and the three resources granted to `admin` (ADR-0012). The mail sender is not a table:
 * it stays in the .env (ADR-0013).
 *
 * The seeded values are neutral: the company starts empty (nothing of a client in the code) and the rates are the
 * Guatemalan ones the requirements fix as defaults (P1). Idempotent, so a half-applied run can continue; it uses no
 * application class because the deployment applies migrations before it uploads the new code.
 */
final class CreateSettingsTables extends AbstractMigration
{
    private const TABLE_OPTIONS = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    private const RESOURCES = ['company' => 'Empresa', 'financial_settings' => 'Finanzas', 'sequences' => 'Numeración'];

    /** code => [name, prefix, period]. Provisional prefixes; the administrator edits them. */
    private const SEQUENCES = [
        'client' => ['Clientes', 'CLI', 'none'],
        'supplier' => ['Proveedores', 'PRV', 'none'],
        'quote' => ['Cotizaciones', 'COT', 'month'],
        'project' => ['Proyectos', 'PRY', 'month'],
        'purchase_order' => ['Órdenes de compra', 'OC', 'month'],
    ];

    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS company ('
            . 'id BINARY(16) NOT NULL, '
            . "singleton ENUM('1') NOT NULL DEFAULT '1', "
            . "legal_name VARCHAR(190) NOT NULL DEFAULT '', "
            . "trade_name VARCHAR(190) NOT NULL DEFAULT '', "
            . "tax_id VARCHAR(30) NOT NULL DEFAULT '', "
            . 'address VARCHAR(255) NULL, '
            . 'phone VARCHAR(40) NULL, '
            . 'email VARCHAR(190) NULL, '
            . "timezone VARCHAR(50) NOT NULL DEFAULT 'America/Guatemala', "
            . 'logo_path VARCHAR(255) NULL, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_company_singleton (singleton)'
            . ')' . self::TABLE_OPTIONS,
        );
        $this->execute(
            'CREATE TABLE IF NOT EXISTS financial_settings ('
            . 'id BINARY(16) NOT NULL, '
            . "singleton ENUM('1') NOT NULL DEFAULT '1', "
            . "currency_code CHAR(3) NOT NULL DEFAULT 'GTQ', "
            . 'vat_rate DECIMAL(6,5) NOT NULL DEFAULT 0.12000, '
            . 'income_tax_rate DECIMAL(6,5) NOT NULL DEFAULT 0.03000, '
            . 'stale_cost_days SMALLINT UNSIGNED NOT NULL DEFAULT 90, '
            . 'quote_validity_days SMALLINT UNSIGNED NOT NULL DEFAULT 15, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_financial_settings_singleton (singleton)'
            . ')' . self::TABLE_OPTIONS,
        );
        $this->execute(
            'CREATE TABLE IF NOT EXISTS sequences ('
            . 'code VARCHAR(50) NOT NULL, '
            . 'name VARCHAR(100) NOT NULL, '
            . 'prefix VARCHAR(10) NOT NULL, '
            . 'padding TINYINT UNSIGNED NOT NULL DEFAULT 4, '
            . "period ENUM('none','year','month') NOT NULL DEFAULT 'none', "
            . 'period_key CHAR(4) NULL, '
            . 'next_value BIGINT UNSIGNED NOT NULL DEFAULT 1, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'PRIMARY KEY (code)'
            . ')' . self::TABLE_OPTIONS,
        );

        foreach (['company', 'financial_settings'] as $table) {
            $this->execute(sprintf(
                "INSERT INTO %s (id, created_at, updated_at) SELECT UNHEX('%s'), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3) "
                . 'FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM %s)',
                $table,
                $this->newUuidV7Hex(),
                $table,
            ));
        }
        foreach (self::SEQUENCES as $code => [$name, $prefix, $period]) {
            $this->execute(sprintf(
                "INSERT IGNORE INTO sequences (code, name, prefix, period, created_at, updated_at) "
                . "VALUES ('%s', '%s', '%s', '%s', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
                $code,
                $name,
                $prefix,
                $period,
            ));
        }

        $resources = "'" . implode("', '", array_keys(self::RESOURCES)) . "'";
        foreach (self::RESOURCES as $code => $name) {
            $this->execute(sprintf("INSERT IGNORE INTO resources (code, name) VALUES ('%s', '%s')", $code, $name));
        }
        $this->execute(
            'INSERT IGNORE INTO role_permissions (role_id, resource_code, permission_code) '
            . 'SELECT r.id, res.code, p.code FROM roles r CROSS JOIN resources res CROSS JOIN permissions p '
            . "WHERE r.code = 'admin' AND res.code IN ($resources) AND p.code IN ('view', 'edit')",
        );
        $this->execute(
            'INSERT IGNORE INTO role_scopes (role_id, resource_code, scope) '
            . "SELECT r.id, res.code, 'all' FROM roles r CROSS JOIN resources res "
            . "WHERE r.code = 'admin' AND res.code IN ($resources)",
        );
    }

    public function down(): void
    {
        $resources = "'" . implode("', '", array_keys(self::RESOURCES)) . "'";
        $this->execute("DELETE FROM role_scopes WHERE resource_code IN ($resources)");
        $this->execute("DELETE FROM role_permissions WHERE resource_code IN ($resources)");
        $this->execute("DELETE FROM resources WHERE code IN ($resources)");
        $this->execute('DROP TABLE IF EXISTS sequences');
        $this->execute('DROP TABLE IF EXISTS financial_settings');
        $this->execute('DROP TABLE IF EXISTS company');
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
