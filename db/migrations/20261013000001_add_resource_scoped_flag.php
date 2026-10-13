<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Permission matrix redesign: a resource says whether its rows have an owner, so a data scope means something for it.
 * Only `users` and `audit_logs` do today; a scope on any other resource is meaningless, so the matrix stops offering it
 * and the API refuses it. The migration that creates a resource sets its own `scoped`.
 *
 * It also fixes data that the new rule would reject: every action needs `view` (an edit nobody can open is nonsense),
 * so roles that hold another action without it get `view`. Stored scopes of unscoped resources are left alone; they
 * disappear the next time their role is saved, because saving replaces the whole set.
 *
 * Idempotent, and it uses no application class (the deployment applies migrations before uploading the new code).
 */
final class AddResourceScopedFlag extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasColumn()) {
            $this->execute('ALTER TABLE resources ADD COLUMN scoped TINYINT(1) NOT NULL DEFAULT 0 AFTER name');
        }
        $this->execute("UPDATE resources SET scoped = 1 WHERE code IN ('users', 'audit_logs')");

        $this->execute(
            'INSERT IGNORE INTO role_permissions (role_id, resource_code, permission_code) '
            . "SELECT DISTINCT role_id, resource_code, 'view' FROM role_permissions WHERE permission_code <> 'view'",
        );
    }

    public function down(): void
    {
        if ($this->hasColumn()) {
            $this->execute('ALTER TABLE resources DROP COLUMN scoped');
        }
    }

    private function hasColumn(): bool
    {
        $row = $this->fetchRow(
            'SELECT COUNT(*) AS found FROM information_schema.columns WHERE table_schema = DATABASE() '
            . "AND table_name = 'resources' AND column_name = 'scoped'",
        );

        return is_array($row) && is_numeric($row['found'] ?? null) && (int) $row['found'] > 0;
    }
}
