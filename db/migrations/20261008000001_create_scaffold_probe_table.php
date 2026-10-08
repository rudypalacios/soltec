<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Scaffolding probe: proves the migration pipeline works and documents the pattern the design relies
 * on to keep a value unique among active records (MySQL 5.7 has no partial indexes).
 *
 * The table is removed by a later migration, once the real schema exists.
 */
final class CreateScaffoldProbeTable extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            'CREATE TABLE scaffold_probe ('
            . 'id INT UNSIGNED NOT NULL AUTO_INCREMENT, '
            . 'code VARCHAR(50) NOT NULL, '
            . 'deleted_at DATETIME NULL, '
            . 'active_code VARCHAR(50) GENERATED ALWAYS AS (IF(deleted_at IS NULL, code, NULL)) STORED, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_scaffold_probe_active_code (active_code)'
            . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        );
    }

    public function down(): void
    {
        $this->execute('DROP TABLE scaffold_probe');
    }
}
