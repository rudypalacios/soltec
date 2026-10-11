<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 1.5: the single-row `security_settings` table that replaces the constants of `SecurityPolicy` (lockout,
 * password expiry and minimum length, session lifetimes), and the resource that governs it, granted to `admin`.
 *
 * The seeded values are the ones the constants had, so nothing changes until an administrator edits them. The limits
 * live in the application (like every other setting). Idempotent, and it uses no application class because the
 * deployment applies migrations before it uploads the new code.
 */
final class CreateSecuritySettingsTable extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS security_settings ('
            . 'id BINARY(16) NOT NULL, '
            . "singleton ENUM('1') NOT NULL DEFAULT '1', "
            . 'web_idle_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30, '
            . 'mobile_refresh_days SMALLINT UNSIGNED NOT NULL DEFAULT 30, '
            . 'max_failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 3, '
            . 'lockout_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 15, '
            . 'password_expiry_days SMALLINT UNSIGNED NOT NULL DEFAULT 90, '
            . 'password_min_length TINYINT UNSIGNED NOT NULL DEFAULT 12, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_security_settings_singleton (singleton)'
            . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        );
        $this->execute(sprintf(
            "INSERT INTO security_settings (id, created_at, updated_at) SELECT UNHEX('%s'), UTC_TIMESTAMP(3), "
            . 'UTC_TIMESTAMP(3) FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM security_settings)',
            $this->newUuidV7Hex(),
        ));

        $this->execute("INSERT IGNORE INTO resources (code, name) VALUES ('security_settings', 'Seguridad')");
        $this->execute(
            'INSERT IGNORE INTO role_permissions (role_id, resource_code, permission_code) '
            . 'SELECT r.id, res.code, p.code FROM roles r CROSS JOIN resources res CROSS JOIN permissions p '
            . "WHERE r.code = 'admin' AND res.code = 'security_settings' AND p.code IN ('view', 'edit')",
        );
        $this->execute(
            'INSERT IGNORE INTO role_scopes (role_id, resource_code, scope) '
            . "SELECT r.id, res.code, 'all' FROM roles r CROSS JOIN resources res "
            . "WHERE r.code = 'admin' AND res.code = 'security_settings'",
        );
    }

    public function down(): void
    {
        $this->execute("DELETE FROM role_scopes WHERE resource_code = 'security_settings'");
        $this->execute("DELETE FROM role_permissions WHERE resource_code = 'security_settings'");
        $this->execute("DELETE FROM resources WHERE code = 'security_settings'");
        $this->execute('DROP TABLE IF EXISTS security_settings');
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
