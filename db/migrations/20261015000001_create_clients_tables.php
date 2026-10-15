<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 2.5 (clients): `clients` with their addresses, billing profile, advisers (`client_sellers`) and linked
 * contacts (`client_contacts`), the foreign key `users.client_id` was waiting for, and the resources `clients` (data
 * scope by adviser, ADR-0025) and `client_profile` (the only one an external role may hold).
 *
 * `resources.audience` says whom a resource is for: the permission matrix of the internal roles offers only the
 * internal ones, so `client_profile` can never end up in an internal role. `admin` gets `clients` with the `all`
 * scope; `client_profile` is granted by the portal slice to the external roles it creates.
 *
 * `active_identification` makes the NIT/CUI unique among active clients (ADR-0022) and `responsible_marker` allows at
 * most one responsible adviser per client (ADR-0025); "exactly one" is a rule of the code. Idempotent, so a
 * half-applied run can continue; it uses no application class because the deployment applies migrations before it
 * uploads the new code.
 */
final class CreateClientsTables extends AbstractMigration
{
    private const TABLE_OPTIONS = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS clients ('
            . 'id BINARY(16) NOT NULL, '
            . 'code VARCHAR(30) NOT NULL, '
            . "type ENUM('prospect', 'customer') NOT NULL, "
            . 'name VARCHAR(190) NOT NULL, '
            . "identification_type ENUM('nit', 'cui', 'none') NOT NULL, "
            . 'identification VARCHAR(20) NULL, '
            . 'active_identification VARCHAR(20) GENERATED ALWAYS AS '
            . "(IF(deleted_at IS NULL AND identification_type <> 'none', identification, NULL)) STORED, "
            . 'status_id BINARY(16) NULL, '
            . 'segment_id BINARY(16) NULL, '
            . 'area_id BINARY(16) NULL, '
            . 'margin_level_id BINARY(16) NULL, '
            . 'converted_at DATETIME(3) NULL, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_clients_code (code), '
            . 'UNIQUE KEY uq_clients_active_identification (active_identification), '
            . 'KEY idx_clients_status (status_id), '
            . 'KEY idx_clients_segment (segment_id), '
            . 'KEY idx_clients_area (area_id), '
            . 'KEY idx_clients_margin_level (margin_level_id), '
            . 'KEY idx_clients_name (name), '
            . 'KEY idx_clients_updated (updated_at), '
            . 'CONSTRAINT fk_clients_status FOREIGN KEY (status_id) REFERENCES client_statuses (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_clients_segment FOREIGN KEY (segment_id) REFERENCES segments (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_clients_area FOREIGN KEY (area_id) REFERENCES areas (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_clients_margin_level FOREIGN KEY (margin_level_id) REFERENCES margin_levels (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );

        $this->execute(
            'CREATE TABLE IF NOT EXISTS client_billing_profiles ('
            . 'client_id BINARY(16) NOT NULL, '
            . 'legal_name VARCHAR(190) NOT NULL, '
            . 'tax_regime_id BINARY(16) NOT NULL, '
            . 'payment_method_id BINARY(16) NULL, '
            . 'credit_days SMALLINT UNSIGNED NULL, '
            . 'credit_limit DECIMAL(14,2) NULL, '
            . 'PRIMARY KEY (client_id), '
            . 'KEY idx_client_billing_tax_regime (tax_regime_id), '
            . 'KEY idx_client_billing_payment_method (payment_method_id), '
            . 'CONSTRAINT fk_client_billing_client FOREIGN KEY (client_id) REFERENCES clients (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_client_billing_tax_regime FOREIGN KEY (tax_regime_id) REFERENCES tax_regimes (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_client_billing_payment_method FOREIGN KEY (payment_method_id) '
            . 'REFERENCES payment_methods (id) ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );

        $this->execute(
            'CREATE TABLE IF NOT EXISTS client_addresses ('
            . 'id BINARY(16) NOT NULL, '
            . 'client_id BINARY(16) NOT NULL, '
            . 'sort_order SMALLINT UNSIGNED NOT NULL, '
            . 'label VARCHAR(60) NOT NULL, '
            . 'address VARCHAR(255) NOT NULL, '
            . 'zone VARCHAR(100) NULL, '
            . 'country VARCHAR(100) NULL, '
            . 'is_primary TINYINT(1) NOT NULL DEFAULT 0, '
            . 'primary_marker BINARY(16) GENERATED ALWAYS AS (IF(is_primary = 1, client_id, NULL)) STORED, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_client_addresses_primary (primary_marker), '
            . 'KEY idx_client_addresses_client (client_id), '
            . 'CONSTRAINT fk_client_addresses_client FOREIGN KEY (client_id) REFERENCES clients (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );

        $this->execute(
            'CREATE TABLE IF NOT EXISTS client_sellers ('
            . 'client_id BINARY(16) NOT NULL, '
            . 'user_id BINARY(16) NOT NULL, '
            . 'is_responsible TINYINT(1) NOT NULL DEFAULT 0, '
            . 'responsible_marker BINARY(16) GENERATED ALWAYS AS (IF(is_responsible = 1, client_id, NULL)) STORED, '
            . 'PRIMARY KEY (client_id, user_id), '
            . 'UNIQUE KEY uq_client_sellers_responsible (responsible_marker), '
            . 'KEY idx_client_sellers_user (user_id), '
            . 'CONSTRAINT fk_client_sellers_client FOREIGN KEY (client_id) REFERENCES clients (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_client_sellers_user FOREIGN KEY (user_id) REFERENCES users (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );

        $this->execute(
            'CREATE TABLE IF NOT EXISTS client_contacts ('
            . 'client_id BINARY(16) NOT NULL, '
            . 'contact_id BINARY(16) NOT NULL, '
            . 'contact_type_id BINARY(16) NOT NULL, '
            . 'PRIMARY KEY (client_id, contact_id, contact_type_id), '
            . 'KEY idx_client_contacts_contact (contact_id), '
            . 'KEY idx_client_contacts_type (contact_type_id), '
            . 'CONSTRAINT fk_client_contacts_client FOREIGN KEY (client_id) REFERENCES clients (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_client_contacts_contact FOREIGN KEY (contact_id) REFERENCES contacts (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_client_contacts_type FOREIGN KEY (contact_type_id) REFERENCES contact_types (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );

        if (!$this->foreignKeyExists('users', 'fk_users_client')) {
            $this->execute(
                'ALTER TABLE users ADD CONSTRAINT fk_users_client FOREIGN KEY (client_id) '
                . 'REFERENCES clients (id) ON DELETE RESTRICT ON UPDATE RESTRICT',
            );
        }

        if (!$this->columnExists('resources', 'audience')) {
            $this->execute(
                "ALTER TABLE resources ADD COLUMN audience ENUM('internal', 'external') NOT NULL "
                . "DEFAULT 'internal' AFTER scoped",
            );
        }

        $this->execute("INSERT IGNORE INTO resources (code, name) VALUES ('clients', 'Clientes')");
        $this->execute("UPDATE resources SET scoped = 1 WHERE code = 'clients'");
        $this->execute(
            "INSERT IGNORE INTO resources (code, name, audience) VALUES ('client_profile', 'Perfil del cliente', "
            . "'external')",
        );
        $this->execute("UPDATE resources SET audience = 'external' WHERE code = 'client_profile'");
        $this->execute(
            'INSERT IGNORE INTO role_permissions (role_id, resource_code, permission_code) '
            . "SELECT r.id, 'clients', p.code FROM roles r CROSS JOIN permissions p "
            . "WHERE r.code = 'admin' AND p.code IN ('view', 'create', 'edit', 'deactivate')",
        );
        $this->execute(
            'INSERT IGNORE INTO role_scopes (role_id, resource_code, scope) '
            . "SELECT r.id, 'clients', 'all' FROM roles r WHERE r.code = 'admin'",
        );
    }

    public function down(): void
    {
        $this->execute("DELETE FROM role_scopes WHERE resource_code IN ('clients', 'client_profile')");
        $this->execute("DELETE FROM role_permissions WHERE resource_code IN ('clients', 'client_profile')");
        $this->execute("DELETE FROM resources WHERE code IN ('clients', 'client_profile')");
        if ($this->columnExists('resources', 'audience')) {
            $this->execute('ALTER TABLE resources DROP COLUMN audience');
        }
        if ($this->foreignKeyExists('users', 'fk_users_client')) {
            $this->execute('ALTER TABLE users DROP FOREIGN KEY fk_users_client');
        }
        $tables = ['client_contacts', 'client_sellers', 'client_addresses', 'client_billing_profiles', 'clients'];
        foreach ($tables as $table) {
            $this->execute('DROP TABLE IF EXISTS ' . $table);
        }
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

    private function columnExists(string $table, string $column): bool
    {
        $row = $this->fetchRow(sprintf(
            'SELECT COUNT(*) AS found FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() '
            . "AND TABLE_NAME = '%s' AND COLUMN_NAME = '%s'",
            $table,
            $column,
        ));

        return is_array($row) && is_numeric($row['found'] ?? null) && $row['found'] > 0;
    }
}
