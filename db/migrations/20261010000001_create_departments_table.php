<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 1.2 (organization): departments, the foreign key that `users.department_id` was waiting for, and the
 * `departments` resource granted to `admin` with the `all` scope (ADR-0012). The direct manager already lives in
 * `users.manager_id`. Idempotent, so a half-applied run can continue; it uses no application class because the
 * deployment applies migrations before it uploads the new code.
 */
final class CreateDepartmentsTable extends AbstractMigration
{
    private const TABLE_OPTIONS = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS departments ('
            . 'id BINARY(16) NOT NULL, '
            . 'name VARCHAR(100) NOT NULL, '
            . 'active_name VARCHAR(100) GENERATED ALWAYS AS (IF(deleted_at IS NULL, name, NULL)) STORED, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_departments_active_name (active_name), '
            . 'KEY idx_departments_updated (updated_at)'
            . ')' . self::TABLE_OPTIONS,
        );

        if (!$this->foreignKeyExists('users', 'fk_users_department')) {
            $this->execute(
                'ALTER TABLE users ADD CONSTRAINT fk_users_department FOREIGN KEY (department_id) '
                . 'REFERENCES departments (id) ON DELETE RESTRICT ON UPDATE RESTRICT',
            );
        }

        $this->execute("INSERT IGNORE INTO resources (code, name) VALUES ('departments', 'Departamentos')");
        $this->execute(
            'INSERT IGNORE INTO role_permissions (role_id, resource_code, permission_code) '
            . "SELECT r.id, 'departments', p.code FROM roles r CROSS JOIN permissions p "
            . "WHERE r.code = 'admin' AND p.code IN ('view', 'create', 'edit', 'deactivate')",
        );
        $this->execute(
            'INSERT IGNORE INTO role_scopes (role_id, resource_code, scope) '
            . "SELECT r.id, 'departments', 'all' FROM roles r WHERE r.code = 'admin'",
        );
    }

    public function down(): void
    {
        $this->execute("DELETE FROM role_scopes WHERE resource_code = 'departments'");
        $this->execute("DELETE FROM role_permissions WHERE resource_code = 'departments'");
        $this->execute("DELETE FROM resources WHERE code = 'departments'");
        if ($this->foreignKeyExists('users', 'fk_users_department')) {
            $this->execute('ALTER TABLE users DROP FOREIGN KEY fk_users_department');
        }
        $this->execute('DROP TABLE IF EXISTS departments');
    }

    private function foreignKeyExists(string $table, string $name): bool
    {
        $row = $this->fetchRow(sprintf(
            'SELECT COUNT(*) AS found FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() '
            . "AND TABLE_NAME = '%s' AND CONSTRAINT_NAME = '%s' AND CONSTRAINT_TYPE = 'FOREIGN KEY'",
            $table,
            $name,
        ));

        return is_array($row) && is_numeric($row['found'] ?? null) && $row['found'] > 0;
    }
}
