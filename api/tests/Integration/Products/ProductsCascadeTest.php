<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Products;

use Soltec\Kernel\Uuid;

/** ADR-0023: deactivating a supplier takes its active products down with it. */
final class ProductsCascadeTest extends ProductsTestCase
{
    /** @return array<array-key, mixed> */
    private function deactivateSupplier(string $id): array
    {
        return $this->json($this->api('POST', '/suppliers/' . $id . '/deactivate', $this->adminToken));
    }

    public function testDeactivatingASupplierDeactivatesItsActiveProductsWithItsReasonAndAuditsEach(): void
    {
        $other = $this->makeSupplier('Aceros');
        $one = $this->text($this->makeProduct('Uno'), 'id');
        $two = $this->text($this->makeProduct('Dos'), 'id');
        $byHand = $this->text($this->makeProduct('A mano'), 'id');
        $elsewhere = $this->text($this->makeProduct('De otro', '5', ['supplier_id' => $other]), 'id');
        $this->api('POST', '/products/' . $byHand . '/deactivate', $this->adminToken);

        $supplier = $this->deactivateSupplier($this->supplierId);

        self::assertSame(2, $supplier['deactivated_product_count']);
        foreach ([$one, $two] as $id) {
            $product = $this->product($id);
            self::assertFalse($product['is_active']);
            self::assertSame('supplier', $product['deactivation_reason']);
            self::assertSame(['create', 'deactivate'], array_column($this->auditEntries('products', $id), 'action'));
        }
        // One turned off by hand keeps its own reason, and another supplier's product is not touched.
        self::assertSame('manual', $this->product($byHand)['deactivation_reason']);
        self::assertTrue($this->product($elsewhere)['is_active']);
        $entry = $this->auditEntries('products', $one)[1];
        self::assertSame('supplier', $this->valueAt($entry, 'after', 'deactivation_reason'));
        // The supplier's own entry says how many went with it.
        $audit = $this->auditEntries('suppliers', $this->supplierId);
        self::assertSame(2, $this->valueAt($audit[1], 'after', 'deactivated_product_count'));
    }

    public function testDeactivatingAgainOrASupplierWithoutProductsCascadesNothing(): void
    {
        $id = $this->text($this->makeProduct('Uno'), 'id');
        $empty = $this->makeSupplier('Vacío');

        $this->api('POST', '/suppliers/' . $this->supplierId . '/deactivate', $this->adminToken);
        $again = $this->json($this->api('POST', '/suppliers/' . $this->supplierId . '/deactivate', $this->adminToken));
        $none = $this->json($this->api('POST', '/suppliers/' . $empty . '/deactivate', $this->adminToken));

        self::assertSame(1, $again['deactivated_product_count']);
        self::assertSame(0, $none['deactivated_product_count']);
        // The second call changed nothing: one entry for the cascade.
        self::assertSame(['create', 'deactivate'], array_column($this->auditEntries('products', $id), 'action'));
    }

    public function testASupplierWithManyProductsIsDeactivatedWithOneEntryPerProduct(): void
    {
        // More than one batch of the audit (100 entries per statement) and of the update (200 ids).
        $count = 450;
        $now = '2026-10-09 12:00:00.000';
        for ($index = 1; $index <= $count; $index++) {
            $this->connection->executeStatement(
                'INSERT INTO products (id, code, name, supplier_id, group_id, unit_id, cost, cost_updated_at, '
                . 'created_at, updated_at) VALUES (UNHEX(:id), :code, :name, UNHEX(:supplier), UNHEX(:group), '
                . 'UNHEX(:unit), 10, :now, :now, :now)',
                [
                    'id' => Uuid::toHex(Uuid::v7()),
                    'code' => sprintf('BULK-%04d', $index),
                    'name' => 'Masivo ' . $index,
                    'supplier' => Uuid::toHex($this->supplierId),
                    'group' => Uuid::toHex($this->groupId),
                    'unit' => Uuid::toHex($this->unitId),
                    'now' => $now,
                ],
            );
        }

        $supplier = $this->deactivateSupplier($this->supplierId);

        self::assertSame($count, $supplier['deactivated_product_count']);
        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM products WHERE deleted_at IS NULL'));
        self::assertSame(
            $count,
            $this->countRows(
                "SELECT COUNT(*) FROM audit_logs WHERE entity_type = 'products' AND action = 'deactivate'",
            ),
        );
        self::assertSame(
            $count,
            $this->countRows(
                "SELECT COUNT(*) FROM audit_logs WHERE entity_type = 'products' AND entity_label LIKE 'Masivo %'",
            ),
        );
    }

    public function testAProductCannotBeCreatedUnderAnInactiveSupplierEvenRightAfterTheCascade(): void
    {
        $this->makeProduct('Uno');
        $this->api('POST', '/suppliers/' . $this->supplierId . '/deactivate', $this->adminToken);

        $response = $this->api('POST', '/products', $this->adminToken, [
            'name' => 'Tarde', 'supplier_id' => $this->supplierId, 'group_id' => $this->groupId,
            'unit_id' => $this->unitId, 'cost' => '3',
        ]);

        self::assertSame(['supplier_id' => 'not_found'], $this->errorCodes($response));
    }
}
