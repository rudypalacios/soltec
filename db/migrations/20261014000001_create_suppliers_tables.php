<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 2.3b (suppliers): `suppliers` with its addresses and its own people, and the `suppliers` resource granted to
 * `admin`. The resource has no data scope: a supplier is shared by everyone who may see the section (ADR-0025).
 *
 * The people of a supplier (`supplier_contacts`) are NOT rows of `contacts`: those belong to the adviser who entered
 * them, while these belong to the supplier and are seen by whoever sees it. Addresses and people are replaced as a
 * set when the supplier is edited, so they carry no version or deactivation of their own.
 *
 * `active_identification` makes the NIT/CUI unique among active suppliers (ADR-0022); the type `none` takes no part.
 * Idempotent, so a half-applied run can continue; it uses no application class because the deployment applies
 * migrations before it uploads the new code.
 */
final class CreateSuppliersTables extends AbstractMigration
{
    private const TABLE_OPTIONS = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS suppliers ('
            . 'id BINARY(16) NOT NULL, '
            . 'code VARCHAR(30) NOT NULL, '
            . 'name VARCHAR(190) NOT NULL, '
            . 'legal_name VARCHAR(190) NULL, '
            . "identification_type ENUM('nit', 'cui', 'none') NOT NULL, "
            . 'identification VARCHAR(20) NULL, '
            . 'active_identification VARCHAR(20) GENERATED ALWAYS AS '
            . "(IF(deleted_at IS NULL AND identification_type <> 'none', identification, NULL)) STORED, "
            . 'credit_days SMALLINT UNSIGNED NULL, '
            . 'credit_limit DECIMAL(14,2) NULL, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_suppliers_code (code), '
            . 'UNIQUE KEY uq_suppliers_active_identification (active_identification), '
            . 'KEY idx_suppliers_name (name), '
            . 'KEY idx_suppliers_updated (updated_at)'
            . ')' . self::TABLE_OPTIONS,
        );

        $this->execute(
            'CREATE TABLE IF NOT EXISTS supplier_addresses ('
            . 'id BINARY(16) NOT NULL, '
            . 'supplier_id BINARY(16) NOT NULL, '
            . 'sort_order SMALLINT UNSIGNED NOT NULL, '
            . 'label VARCHAR(60) NOT NULL, '
            . 'address VARCHAR(255) NOT NULL, '
            . 'zone VARCHAR(100) NULL, '
            . 'country VARCHAR(100) NULL, '
            . 'is_primary TINYINT(1) NOT NULL DEFAULT 0, '
            . 'primary_marker BINARY(16) GENERATED ALWAYS AS (IF(is_primary = 1, supplier_id, NULL)) STORED, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_supplier_addresses_primary (primary_marker), '
            . 'KEY idx_supplier_addresses_supplier (supplier_id), '
            . 'CONSTRAINT fk_supplier_addresses_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );

        $this->execute(
            'CREATE TABLE IF NOT EXISTS supplier_contacts ('
            . 'id BINARY(16) NOT NULL, '
            . 'supplier_id BINARY(16) NOT NULL, '
            . 'sort_order SMALLINT UNSIGNED NOT NULL, '
            . 'name VARCHAR(150) NOT NULL, '
            . 'job_title VARCHAR(100) NULL, '
            . 'contact_type_id BINARY(16) NULL, '
            . 'phone VARCHAR(40) NULL, '
            . 'mobile VARCHAR(40) NULL, '
            . 'email VARCHAR(190) NULL, '
            . 'address VARCHAR(255) NULL, '
            . 'zone VARCHAR(100) NULL, '
            . 'country VARCHAR(100) NULL, '
            . 'PRIMARY KEY (id), '
            . 'KEY idx_supplier_contacts_supplier (supplier_id), '
            . 'KEY idx_supplier_contacts_type (contact_type_id), '
            . 'CONSTRAINT fk_supplier_contacts_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_supplier_contacts_type FOREIGN KEY (contact_type_id) REFERENCES contact_types (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );

        $this->execute("INSERT IGNORE INTO resources (code, name) VALUES ('suppliers', 'Proveedores')");
        $this->execute(
            'INSERT IGNORE INTO role_permissions (role_id, resource_code, permission_code) '
            . "SELECT r.id, 'suppliers', p.code FROM roles r CROSS JOIN permissions p "
            . "WHERE r.code = 'admin' AND p.code IN ('view', 'create', 'edit', 'deactivate')",
        );
    }

    public function down(): void
    {
        $this->execute("DELETE FROM role_permissions WHERE resource_code = 'suppliers'");
        $this->execute("DELETE FROM resources WHERE code = 'suppliers'");
        $this->execute('DROP TABLE IF EXISTS supplier_contacts');
        $this->execute('DROP TABLE IF EXISTS supplier_addresses');
        $this->execute('DROP TABLE IF EXISTS suppliers');
    }
}
