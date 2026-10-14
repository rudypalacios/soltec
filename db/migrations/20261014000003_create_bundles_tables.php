<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 2.4b (bundles): `bundles` and `bundle_items`, the `bundle` numbering and the `bundles` resource granted to
 * `admin`, without a data scope.
 *
 * A bundle is a compound product: it has a group (so an area) and an optional brand like a product, but no unit (its
 * components come in different ones), no supplier and no cost of its own. Its cost is the sum of quantity times cost
 * of its components and its price is derived from that, so none is stored (ADR-0011); the order a person lists the
 * components in is kept in `sort_order`.
 *
 * Idempotent, so a half-applied run can continue; it uses no application class because the deployment applies
 * migrations before it uploads the new code.
 */
final class CreateBundlesTables extends AbstractMigration
{
    private const TABLE_OPTIONS = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS bundles ('
            . 'id BINARY(16) NOT NULL, '
            . 'code VARCHAR(30) NOT NULL, '
            . 'name VARCHAR(190) NOT NULL, '
            . 'description TEXT NULL, '
            . 'group_id BINARY(16) NOT NULL, '
            . 'brand_id BINARY(16) NULL, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_bundles_code (code), '
            . 'KEY idx_bundles_group (group_id), '
            . 'KEY idx_bundles_brand (brand_id), '
            . 'KEY idx_bundles_name (name), '
            . 'KEY idx_bundles_updated (updated_at), '
            . 'CONSTRAINT fk_bundles_group FOREIGN KEY (group_id) REFERENCES product_groups (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_bundles_brand FOREIGN KEY (brand_id) REFERENCES brands (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );

        $this->execute(
            'CREATE TABLE IF NOT EXISTS bundle_items ('
            . 'bundle_id BINARY(16) NOT NULL, '
            . 'product_id BINARY(16) NOT NULL, '
            . 'sort_order SMALLINT UNSIGNED NOT NULL, '
            . 'quantity DECIMAL(12,3) NOT NULL, '
            . 'PRIMARY KEY (bundle_id, product_id), '
            . 'KEY idx_bundle_items_product (product_id), '
            . 'CONSTRAINT fk_bundle_items_bundle FOREIGN KEY (bundle_id) REFERENCES bundles (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_bundle_items_product FOREIGN KEY (product_id) REFERENCES products (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );

        $this->execute(
            'INSERT IGNORE INTO sequences (code, name, prefix, period, created_at, updated_at) '
            . "VALUES ('bundle', 'Paquetes', 'PAQ', 'none', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
        );

        $this->execute("INSERT IGNORE INTO resources (code, name) VALUES ('bundles', 'Paquetes')");
        $this->execute(
            'INSERT IGNORE INTO role_permissions (role_id, resource_code, permission_code) '
            . "SELECT r.id, 'bundles', p.code FROM roles r CROSS JOIN permissions p "
            . "WHERE r.code = 'admin' AND p.code IN ('view', 'create', 'edit', 'deactivate')",
        );
    }

    public function down(): void
    {
        $this->execute("DELETE FROM role_permissions WHERE resource_code = 'bundles'");
        $this->execute("DELETE FROM resources WHERE code = 'bundles'");
        $this->execute("DELETE FROM sequences WHERE code = 'bundle'");
        $this->execute('DROP TABLE IF EXISTS bundle_items');
        $this->execute('DROP TABLE IF EXISTS bundles');
    }
}
