<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 1.5c, second step: the name of who acted as it was when the entry was written, for the same reason as
 * `entity_label` (a renamed person would otherwise rewrite their own past). It is a new migration because the one
 * before already ran in staging and Phinx does not run a registered migration again. Existing entries have none; the
 * screen falls back to the current name. Idempotent, and it uses no application class.
 */
final class AddAuditUserLabel extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasColumn()) {
            $this->execute('ALTER TABLE audit_logs ADD COLUMN user_label VARCHAR(150) NULL AFTER user_id');
        }
    }

    public function down(): void
    {
        if ($this->hasColumn()) {
            $this->execute('ALTER TABLE audit_logs DROP COLUMN user_label');
        }
    }

    private function hasColumn(): bool
    {
        $row = $this->fetchRow(
            'SELECT COUNT(*) AS found FROM information_schema.columns WHERE table_schema = DATABASE() '
            . "AND table_name = 'audit_logs' AND column_name = 'user_label'",
        );

        return is_array($row) && is_numeric($row['found'] ?? null) && (int) $row['found'] > 0;
    }
}
