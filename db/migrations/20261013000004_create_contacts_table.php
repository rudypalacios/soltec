<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 2.3a (contacts): the `contacts` table, the foreign key `users.contact_id` was waiting for, the `contact`
 * numbering and the `contacts` resource granted to `admin` with the `all` scope. A contact belongs to the user who
 * entered it (`owner_id`) and the data scope of the resource is decided by that owner (ADR-0025); the resource is
 * flagged `scoped` so the permission matrix offers a scope for it.
 *
 * There is no unique index on the email or the name: two advisers may keep the same person. Idempotent, so a
 * half-applied run can continue; it uses no application class because the deployment applies migrations before it
 * uploads the new code.
 */
final class CreateContactsTable extends AbstractMigration
{
    private const TABLE_OPTIONS = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS contacts ('
            . 'id BINARY(16) NOT NULL, '
            . 'code VARCHAR(30) NOT NULL, '
            . 'name VARCHAR(150) NOT NULL, '
            . 'phone VARCHAR(40) NULL, '
            . 'mobile VARCHAR(40) NULL, '
            . 'email VARCHAR(190) NULL, '
            . 'address VARCHAR(255) NULL, '
            . 'zone VARCHAR(100) NULL, '
            . 'country VARCHAR(100) NULL, '
            . 'owner_id BINARY(16) NOT NULL, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_contacts_code (code), '
            . 'KEY idx_contacts_owner (owner_id), '
            . 'KEY idx_contacts_name (name), '
            . 'KEY idx_contacts_updated (updated_at), '
            . 'CONSTRAINT fk_contacts_owner FOREIGN KEY (owner_id) REFERENCES users (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );

        if (!$this->foreignKeyExists('users', 'fk_users_contact')) {
            $this->execute(
                'ALTER TABLE users ADD CONSTRAINT fk_users_contact FOREIGN KEY (contact_id) '
                . 'REFERENCES contacts (id) ON DELETE RESTRICT ON UPDATE RESTRICT',
            );
        }

        $this->execute(
            'INSERT IGNORE INTO sequences (code, name, prefix, period, created_at, updated_at) '
            . "VALUES ('contact', 'Contactos', 'CON', 'none', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
        );

        $this->execute("INSERT IGNORE INTO resources (code, name) VALUES ('contacts', 'Contactos')");
        $this->execute("UPDATE resources SET scoped = 1 WHERE code = 'contacts'");
        $this->execute(
            'INSERT IGNORE INTO role_permissions (role_id, resource_code, permission_code) '
            . "SELECT r.id, 'contacts', p.code FROM roles r CROSS JOIN permissions p "
            . "WHERE r.code = 'admin' AND p.code IN ('view', 'create', 'edit', 'deactivate')",
        );
        $this->execute(
            'INSERT IGNORE INTO role_scopes (role_id, resource_code, scope) '
            . "SELECT r.id, 'contacts', 'all' FROM roles r WHERE r.code = 'admin'",
        );
    }

    public function down(): void
    {
        $this->execute("DELETE FROM role_scopes WHERE resource_code = 'contacts'");
        $this->execute("DELETE FROM role_permissions WHERE resource_code = 'contacts'");
        $this->execute("DELETE FROM resources WHERE code = 'contacts'");
        $this->execute("DELETE FROM sequences WHERE code = 'contact'");
        if ($this->foreignKeyExists('users', 'fk_users_contact')) {
            $this->execute('ALTER TABLE users DROP FOREIGN KEY fk_users_contact');
        }
        $this->execute('DROP TABLE IF EXISTS contacts');
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
