<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 1.4: the margin levels are listed by margin, so the manual `sort_order` column that the first version of the
 * table carried has no use. It is dropped in its own migration, not by editing the one that created it, because that
 * one already ran on `staging`. Idempotent (a database that never had the column is left alone) and free of
 * application classes, like every migration.
 */
final class DropMarginLevelsSortOrder extends AbstractMigration
{
    public function up(): void
    {
        if ($this->sortOrderExists()) {
            $this->execute('ALTER TABLE margin_levels DROP COLUMN sort_order');
        }
    }

    public function down(): void
    {
        if (!$this->sortOrderExists()) {
            $this->execute(
                'ALTER TABLE margin_levels '
                . 'ADD COLUMN sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER default_marker',
            );
        }
    }

    private function sortOrderExists(): bool
    {
        $row = $this->fetchRow(
            'SELECT COUNT(*) AS found FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() '
            . "AND TABLE_NAME = 'margin_levels' AND COLUMN_NAME = 'sort_order'",
        );

        return is_array($row) && is_numeric($row['found'] ?? null) && $row['found'] > 0;
    }
}
