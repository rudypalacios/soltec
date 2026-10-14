<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 2.4a (products): the `products` table, the `product` numbering and the `products` resource granted to
 * `admin`, without a data scope.
 *
 * A product keeps its cost (VAT included, as on the supplier's invoice) and the moment that cost was last updated or
 * confirmed (`cost_updated_at`); no price is stored, it is computed from the cost and a margin level (ADR-0011).
 * `deactivation_reason` tells a product turned off by hand from one turned off with its supplier (ADR-0023), so the
 * latter can be reactivated together.
 *
 * Idempotent, so a half-applied run can continue; it uses no application class because the deployment applies
 * migrations before it uploads the new code.
 */
final class CreateProductsTable extends AbstractMigration
{
    private const TABLE_OPTIONS = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS products ('
            . 'id BINARY(16) NOT NULL, '
            . 'code VARCHAR(30) NOT NULL, '
            . 'name VARCHAR(190) NOT NULL, '
            . 'description TEXT NULL, '
            . 'supplier_id BINARY(16) NOT NULL, '
            . 'group_id BINARY(16) NOT NULL, '
            . 'brand_id BINARY(16) NULL, '
            . 'unit_id BINARY(16) NOT NULL, '
            . 'cost DECIMAL(13,4) NOT NULL, '
            . 'cost_updated_at DATETIME(3) NOT NULL, '
            . 'check_availability TINYINT(1) NOT NULL DEFAULT 0, '
            . "deactivation_reason ENUM('manual', 'supplier') NULL, "
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_products_code (code), '
            . 'KEY idx_products_supplier (supplier_id), '
            . 'KEY idx_products_group (group_id), '
            . 'KEY idx_products_brand (brand_id), '
            . 'KEY idx_products_name (name), '
            . 'KEY idx_products_cost_updated (cost_updated_at), '
            . 'KEY idx_products_updated (updated_at), '
            . 'CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_products_group FOREIGN KEY (group_id) REFERENCES product_groups (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_products_brand FOREIGN KEY (brand_id) REFERENCES brands (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_products_unit FOREIGN KEY (unit_id) REFERENCES units_of_measure (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );

        $this->execute(
            'INSERT IGNORE INTO sequences (code, name, prefix, period, created_at, updated_at) '
            . "VALUES ('product', 'Productos', 'PRD', 'none', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
        );

        $this->execute("INSERT IGNORE INTO resources (code, name) VALUES ('products', 'Productos')");
        $this->execute(
            'INSERT IGNORE INTO role_permissions (role_id, resource_code, permission_code) '
            . "SELECT r.id, 'products', p.code FROM roles r CROSS JOIN permissions p "
            . "WHERE r.code = 'admin' AND p.code IN ('view', 'create', 'edit', 'deactivate')",
        );
    }

    public function down(): void
    {
        $this->execute("DELETE FROM role_permissions WHERE resource_code = 'products'");
        $this->execute("DELETE FROM resources WHERE code = 'products'");
        $this->execute("DELETE FROM sequences WHERE code = 'product'");
        $this->execute('DROP TABLE IF EXISTS products');
    }
}
