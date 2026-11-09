<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 3.2 (files and photos): the table that describes each photo the system keeps and the `files` resource,
 * granted to `admin` with the `all` scope. The photo is stored twice, normal and thumbnail, outside the public
 * directory (ADR-0009); only their paths live here. The owner of a file is whoever uploaded it, which is what the
 * data scope of the resource follows until a record adopts it (ADR-0027).
 *
 * Idempotent, and it uses no application class because the deployment applies migrations before it uploads the
 * new code.
 */
final class CreateFilesTable extends AbstractMigration
{
    private const TABLE_OPTIONS = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS files ('
            . 'id BINARY(16) NOT NULL, '
            . 'uploaded_by BINARY(16) NOT NULL, '
            . 'original_name VARCHAR(190) NOT NULL, '
            . 'width INT UNSIGNED NOT NULL, '
            . 'height INT UNSIGNED NOT NULL, '
            . 'size_bytes INT UNSIGNED NOT NULL, '
            . 'content_hash CHAR(40) NOT NULL, '
            . 'normal_path VARCHAR(190) NOT NULL, '
            . 'thumbnail_path VARCHAR(190) NOT NULL, '
            . 'metadata JSON NULL, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . 'KEY idx_files_uploaded_by (uploaded_by), '
            . 'KEY idx_files_updated (updated_at), '
            . 'CONSTRAINT fk_files_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );

        $this->execute("INSERT IGNORE INTO resources (code, name) VALUES ('files', 'Archivos')");
        $this->execute("UPDATE resources SET scoped = 1 WHERE code = 'files'");
        $this->execute(
            'INSERT IGNORE INTO role_permissions (role_id, resource_code, permission_code) '
            . "SELECT r.id, 'files', p.code FROM roles r CROSS JOIN permissions p "
            . "WHERE r.code = 'admin' AND p.code IN ('view', 'create', 'edit', 'deactivate')",
        );
        $this->execute(
            'INSERT IGNORE INTO role_scopes (role_id, resource_code, scope) '
            . "SELECT r.id, 'files', 'all' FROM roles r WHERE r.code = 'admin'",
        );
    }

    public function down(): void
    {
        $this->execute("DELETE FROM role_scopes WHERE resource_code = 'files'");
        $this->execute("DELETE FROM role_permissions WHERE resource_code = 'files'");
        $this->execute("DELETE FROM resources WHERE code = 'files'");
        $this->execute('DROP TABLE IF EXISTS files');
    }
}
