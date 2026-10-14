<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Products;

final class ProductsBulkTest extends ProductsTestCase
{
    /** @return list<string> */
    private function makeProducts(int $count, ?string $supplierId = null): array
    {
        $ids = [];
        for ($index = 1; $index <= $count; $index++) {
            $ids[] = $this->text($this->makeProduct('Producto ' . $index, '10', [
                'supplier_id' => $supplierId ?? $this->supplierId,
            ]), 'id');
        }

        return $ids;
    }

    public function testDeactivatesSeveralByHandWithOneEntryEachAndCountsWhatWasAlreadyOff(): void
    {
        [$a, $b, $c] = $this->makeProducts(3);
        $this->api('POST', '/products/' . $c . '/deactivate', $this->adminToken);

        $response = $this->api('POST', '/products/deactivate', $this->adminToken, ['ids' => [$a, $b, $c]]);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['affected' => 2, 'unchanged' => 1, 'blocked' => 0], $this->json($response));
        foreach ([$a, $b] as $id) {
            $product = $this->product($id);
            self::assertFalse($product['is_active']);
            self::assertSame('manual', $product['deactivation_reason']);
            self::assertSame(['create', 'deactivate'], array_column($this->auditEntries('products', $id), 'action'));
            self::assertSame(2, $product['version']);
        }
        // The one already off was not touched again.
        self::assertSame(['create', 'deactivate'], array_column($this->auditEntries('products', $c), 'action'));
    }

    public function testReactivatesSeveralAndLeavesBlockedTheOnesWhoseSupplierIsOff(): void
    {
        $other = $this->makeSupplier('Aceros');
        [$a] = $this->makeProducts(1);
        [$b] = $this->makeProducts(1, $other);
        $this->api('POST', '/products/deactivate', $this->adminToken, ['ids' => [$a, $b]]);
        $this->api('POST', '/suppliers/' . $other . '/deactivate', $this->adminToken);

        $response = $this->api('POST', '/products/reactivate', $this->adminToken, ['ids' => [$a, $b]]);

        self::assertSame(['affected' => 1, 'unchanged' => 0, 'blocked' => 1], $this->json($response));
        self::assertTrue($this->product($a)['is_active']);
        self::assertFalse($this->product($b)['is_active']);
    }

    public function testAnUnknownIdFailsTheWholeCallAndChangesNothing(): void
    {
        [$a] = $this->makeProducts(1);

        $response = $this->api('POST', '/products/deactivate', $this->adminToken, ['ids' => [$a, self::GONE]]);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame(['ids' => 'not_found'], $this->errorCodes($response));
        self::assertTrue($this->product($a)['is_active']);
    }

    public function testValidatesTheListOfIds(): void
    {
        [$a] = $this->makeProducts(1);
        $tooMany = array_map(fn (int $n): string => sprintf('0192a1b2-0000-7000-8000-%012d', $n), range(1, 501));

        $cases = [
            'missing' => [[], ['ids' => 'required']],
            'empty' => [['ids' => []], ['ids' => 'required']],
            'duplicated' => [['ids' => [$a, $a]], ['ids' => 'invalid']],
            'not a uuid' => [['ids' => ['x']], ['ids' => 'invalid']],
            'too many' => [['ids' => $tooMany], ['ids' => 'too_many']],
        ];
        foreach (['/products/deactivate', '/products/reactivate', '/products/confirm-cost'] as $path) {
            foreach ($cases as $label => [$body, $errors]) {
                $response = $this->api('POST', $path, $this->adminToken, $body);
                self::assertSame($errors, $this->errorCodes($response), $path . ' ' . $label);
            }
        }
    }

    public function testReactivatesWhatASupplierTookDownAndNothingElse(): void
    {
        [$withSupplier, $byHand] = $this->makeProducts(2);
        $this->api('POST', '/products/' . $byHand . '/deactivate', $this->adminToken);
        $this->api('POST', '/suppliers/' . $this->supplierId . '/deactivate', $this->adminToken);
        // Reactivating the supplier brings none of them back.
        $supplier = $this->json(
            $this->api('POST', '/suppliers/' . $this->supplierId . '/reactivate', $this->adminToken),
        );
        self::assertSame(1, $supplier['deactivated_product_count']);
        self::assertFalse($this->product($withSupplier)['is_active']);

        $response = $this->api('POST', '/products/reactivate', $this->adminToken, ['supplier_id' => $this->supplierId]);

        self::assertSame(['affected' => 1, 'unchanged' => 0, 'blocked' => 0], $this->json($response));
        self::assertTrue($this->product($withSupplier)['is_active']);
        $stillOff = $this->product($byHand);
        self::assertFalse($stillOff['is_active']);
        self::assertSame('manual', $stillOff['deactivation_reason']);
        $supplier = $this->json($this->api('GET', '/suppliers/' . $this->supplierId, $this->adminToken));
        self::assertSame(0, $supplier['deactivated_product_count']);
    }

    public function testReactivatingBySupplierNeedsAnActiveKnownSupplierAndNotBothForms(): void
    {
        [$a] = $this->makeProducts(1);
        $this->api('POST', '/suppliers/' . $this->supplierId . '/deactivate', $this->adminToken);

        $off = $this->api('POST', '/products/reactivate', $this->adminToken, ['supplier_id' => $this->supplierId]);
        self::assertSame(['supplier_id' => 'parent_inactive'], $this->errorCodes($off));
        $both = $this->api('POST', '/products/reactivate', $this->adminToken, [
            'supplier_id' => $this->supplierId, 'ids' => [$a],
        ]);
        self::assertSame(['ids' => 'invalid'], $this->errorCodes($both));
    }

    public function testConfirmsTheCostOfSeveralProductsAndLeavesOutTheDeactivatedOnes(): void
    {
        [$a, $b, $c] = $this->makeProducts(3);
        $this->api('POST', '/products/' . $c . '/deactivate', $this->adminToken);
        $before = $this->product($a)['cost_updated_at'];
        $this->advance('+100 days');
        self::assertTrue($this->product($a)['cost_is_stale']);

        $response = $this->api('POST', '/products/confirm-cost', $this->adminToken, ['ids' => [$a, $b, $c]]);

        self::assertSame(['affected' => 2, 'unchanged' => 1, 'blocked' => 0], $this->json($response));
        foreach ([$a, $b] as $id) {
            $product = $this->product($id);
            self::assertFalse($product['cost_is_stale']);
            self::assertSame('10.0000', $product['cost']);
            self::assertSame(['create', 'cost_review'], array_column($this->auditEntries('products', $id), 'action'));
        }
        self::assertNotSame($before, $this->product($a)['cost_updated_at']);
        self::assertTrue($this->product($c)['cost_is_stale']);
        $audit = $this->auditEntries('products', $a);
        self::assertSame($before, $this->valueAt($audit[1], 'before', 'cost_updated_at'));
    }

    public function testConfirmsTheCostOfOneProduct(): void
    {
        $id = $this->text($this->makeProduct('Uno', '10'), 'id');
        $this->advance('+100 days');

        $confirmed = $this->json($this->api('POST', '/products/' . $id . '/confirm-cost', $this->adminToken));

        self::assertFalse($confirmed['cost_is_stale']);
        self::assertSame('10.0000', $confirmed['cost']);
        self::assertSame(2, $confirmed['version']);

        $this->api('POST', '/products/' . $id . '/deactivate', $this->adminToken);
        $inactive = $this->api('POST', '/products/' . $id . '/confirm-cost', $this->adminToken);
        self::assertSame(409, $inactive->getStatusCode());
        self::assertSame('product_inactive', $this->json($inactive)['code']);
        self::assertSame(404, $this->statusOf('POST', '/products/' . self::GONE . '/confirm-cost'));
    }

    public function testAnEntryInTheBulkAuditIsStoredWithTheNameOfTheProductAndWhoActed(): void
    {
        [$a] = $this->makeProducts(1);
        $this->api('POST', '/products/deactivate', $this->adminToken, ['ids' => [$a]]);

        $row = $this->connection->fetchAssociative(
            "SELECT entity_label, user_label, action FROM audit_logs WHERE entity_type = 'products' "
            . "AND action = 'deactivate'",
        );

        self::assertIsArray($row);
        self::assertSame('Producto 1', $row['entity_label']);
        self::assertSame('Admin', $row['user_label']);
    }
}
