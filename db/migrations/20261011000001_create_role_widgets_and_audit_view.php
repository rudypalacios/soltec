<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 1.5b: the widgets each role shows on the home screen, the `audit_logs` resource that governs the audit
 * screen, and the index that lets the audit be read newest first without sorting the whole table.
 *
 * Every existing role starts with both widgets the home screen had before it became configurable (shortcuts and the
 * service status), so nobody's home screen changes on the day this is deployed. The widgets themselves are code; the
 * table only stores which role shows which, in what order. Idempotent, and it uses no application class because the
 * deployment applies migrations before it uploads the new code.
 */
final class CreateRoleWidgetsAndAuditView extends AbstractMigration
{
    private const WIDGETS = ['quick_links' => 1, 'service_status' => 2];

    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS role_widgets ('
            . 'role_id BINARY(16) NOT NULL, '
            . 'widget_code VARCHAR(50) NOT NULL, '
            . 'position SMALLINT UNSIGNED NOT NULL, '
            . 'PRIMARY KEY (role_id, widget_code), '
            . 'CONSTRAINT fk_role_widgets_role FOREIGN KEY (role_id) REFERENCES roles (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        );
        foreach (self::WIDGETS as $code => $position) {
            $this->execute(sprintf(
                "INSERT IGNORE INTO role_widgets (role_id, widget_code, position) SELECT id, '%s', %d FROM roles",
                $code,
                $position,
            ));
        }

        $this->execute("INSERT IGNORE INTO resources (code, name) VALUES ('audit_logs', 'Auditoría')");
        $this->execute(
            'INSERT IGNORE INTO role_permissions (role_id, resource_code, permission_code) '
            . 'SELECT r.id, res.code, p.code FROM roles r CROSS JOIN resources res CROSS JOIN permissions p '
            . "WHERE r.code = 'admin' AND res.code = 'audit_logs' AND p.code = 'view'",
        );
        $this->execute(
            'INSERT IGNORE INTO role_scopes (role_id, resource_code, scope) '
            . "SELECT r.id, res.code, 'all' FROM roles r CROSS JOIN resources res "
            . "WHERE r.code = 'admin' AND res.code = 'audit_logs'",
        );

        if (!$this->hasAuditIndex()) {
            $this->execute('ALTER TABLE audit_logs ADD KEY idx_audit_occurred (occurred_at, id)');
        }
    }

    public function down(): void
    {
        $this->execute("DELETE FROM role_scopes WHERE resource_code = 'audit_logs'");
        $this->execute("DELETE FROM role_permissions WHERE resource_code = 'audit_logs'");
        $this->execute("DELETE FROM resources WHERE code = 'audit_logs'");
        $this->execute('DROP TABLE IF EXISTS role_widgets');
        if ($this->hasAuditIndex()) {
            $this->execute('ALTER TABLE audit_logs DROP KEY idx_audit_occurred');
        }
    }

    private function hasAuditIndex(): bool
    {
        $row = $this->fetchRow(
            'SELECT COUNT(*) AS found FROM information_schema.statistics WHERE table_schema = DATABASE() '
            . "AND table_name = 'audit_logs' AND index_name = 'idx_audit_occurred'",
        );

        return is_array($row) && is_numeric($row['found'] ?? null) && (int) $row['found'] > 0;
    }
}
