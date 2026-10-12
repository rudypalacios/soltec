<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 1.5c: the name of the record an audit entry is about, as it was when the entry was written. Reading the
 * current name instead would rewrite history on a rename (an entry made when a profile was «Ventas» would say
 * «Comercial»). Existing entries have none; the screen falls back to the current name and says so.
 * Idempotent, and it uses no application class because the deployment applies migrations before the new code.
 */
final class AddAuditEntityLabel extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasLabelColumn()) {
            $this->execute('ALTER TABLE audit_logs ADD COLUMN entity_label VARCHAR(190) NULL AFTER entity_id');
        }
    }

    public function down(): void
    {
        if ($this->hasLabelColumn()) {
            $this->execute('ALTER TABLE audit_logs DROP COLUMN entity_label');
        }
    }

    private function hasLabelColumn(): bool
    {
        $row = $this->fetchRow(
            'SELECT COUNT(*) AS found FROM information_schema.columns WHERE table_schema = DATABASE() '
            . "AND table_name = 'audit_logs' AND column_name = 'entity_label'",
        );

        return is_array($row) && is_numeric($row['found'] ?? null) && (int) $row['found'] > 0;
    }
}
