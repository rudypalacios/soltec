<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 1.4 (margin levels): the `margin_levels` table, the two levels the client starts with and the
 * `margin_levels` resource granted to `admin` with the `all` scope (ADR-0012). The catalog price is never stored: it
 * is computed from the cost and one of these levels (ADR-0011).
 *
 * `default_marker` is NULL unless the level is the active default, so its unique index allows one default at a time.
 * The seeded 33 % and 35 % are only a starting point (33 % is the level of the ADR-0011 test cases); the client
 * edits them and adds its own. Idempotent, so a half-applied run can continue; it uses no application class because
 * the deployment applies migrations before it uploads the new code.
 */
final class CreateMarginLevelsTable extends AbstractMigration
{
    private const TABLE_OPTIONS = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    /** [name, rate, is_default, sort_order] */
    private const LEVELS = [
        ['Margen 33 %', '0.33000', 1, 1],
        ['Margen 35 %', '0.35000', 0, 2],
    ];

    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS margin_levels ('
            . 'id BINARY(16) NOT NULL, '
            . 'name VARCHAR(60) NOT NULL, '
            . 'active_name VARCHAR(60) GENERATED ALWAYS AS (IF(deleted_at IS NULL, name, NULL)) STORED, '
            . 'rate DECIMAL(6,5) NOT NULL, '
            . 'is_default TINYINT(1) NOT NULL DEFAULT 0, '
            . 'default_marker TINYINT(1) GENERATED ALWAYS AS '
            . '(IF(is_default = 1 AND deleted_at IS NULL, 1, NULL)) STORED, '
            . 'sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_margin_levels_active_name (active_name), '
            . 'UNIQUE KEY uq_margin_levels_default (default_marker), '
            . 'KEY idx_margin_levels_updated (updated_at)'
            . ')' . self::TABLE_OPTIONS,
        );

        foreach (self::LEVELS as [$name, $rate, $isDefault, $sortOrder]) {
            $this->execute(
                'INSERT INTO margin_levels (id, name, rate, is_default, sort_order, created_at, updated_at) '
                . "SELECT UNHEX('" . $this->newUuidV7Hex() . "'), '" . $name . "', " . $rate . ', ' . $isDefault . ', '
                . $sortOrder . ', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3) FROM DUAL '
                . "WHERE NOT EXISTS (SELECT 1 FROM margin_levels WHERE name = '" . $name . "')",
            );
        }

        $this->execute("INSERT IGNORE INTO resources (code, name) VALUES ('margin_levels', 'Niveles de margen')");
        $this->execute(
            'INSERT IGNORE INTO role_permissions (role_id, resource_code, permission_code) '
            . "SELECT r.id, 'margin_levels', p.code FROM roles r CROSS JOIN permissions p "
            . "WHERE r.code = 'admin' AND p.code IN ('view', 'create', 'edit', 'deactivate')",
        );
        $this->execute(
            'INSERT IGNORE INTO role_scopes (role_id, resource_code, scope) '
            . "SELECT r.id, 'margin_levels', 'all' FROM roles r WHERE r.code = 'admin'",
        );
    }

    public function down(): void
    {
        $this->execute("DELETE FROM role_scopes WHERE resource_code = 'margin_levels'");
        $this->execute("DELETE FROM role_permissions WHERE resource_code = 'margin_levels'");
        $this->execute("DELETE FROM resources WHERE code = 'margin_levels'");
        $this->execute('DROP TABLE IF EXISTS margin_levels');
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
