<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Products;

final class ProductsTest extends ProductsTestCase
{
    public function testCreatesAProductWithCodeDerivedPriceAndAuditsIt(): void
    {
        $product = $this->makeProduct('  Conector RJ45 ', '22.96', [
            'description' => 'Categoría 6',
            'brand_id' => $this->brandId,
            'check_availability' => true,
        ]);

        self::assertSame('PRD-0001', $product['code']);
        self::assertSame('Conector RJ45', $product['name']);
        self::assertSame('22.9600', $product['cost']);
        self::assertTrue($product['check_availability']);
        self::assertTrue($product['is_active']);
        self::assertNull($product['deactivation_reason']);
        self::assertSame('Cables del Sur', $this->text($product, 'supplier', 'name'));
        self::assertSame('Conectores', $this->text($product, 'group', 'name'));
        // The area comes from the group.
        self::assertSame('Aire Acondicionado', $this->text($product, 'area', 'name'));
        self::assertSame('Panduit', $this->text($product, 'brand', 'name'));
        // ADR-0011 with VAT 12 %, ISR 3 % and margin 33 %: 22.96 sells for 31.54 and 35.33.
        self::assertSame('31.54', $product['price_without_vat']);
        self::assertSame('35.33', $product['price_with_vat']);
        self::assertSame('Margen 33 %', $this->text($product, 'margin_level', 'name'));
        self::assertFalse($product['cost_is_stale']);

        $audit = $this->auditEntries('products', $this->text($product, 'id'));
        self::assertSame(['create'], array_column($audit, 'action'));
        self::assertSame('PRD-0001', $this->valueAt($audit[0], 'after', 'code'));
        self::assertSame(
            'Conector RJ45',
            $this->connection->fetchOne("SELECT entity_label FROM audit_logs WHERE entity_type = 'products'"),
        );
    }

    public function testCodesAreConsecutiveAndTheBrandIsOptional(): void
    {
        $first = $this->makeProduct('Uno');
        $second = $this->makeProduct('Dos');

        self::assertSame(['PRD-0001', 'PRD-0002'], [$first['code'], $second['code']]);
        self::assertNull($first['brand']);
        self::assertFalse($first['check_availability']);
    }

    public function testValidatesTheFields(): void
    {
        $empty = $this->api('POST', '/products', $this->adminToken, ['name' => ' ']);
        self::assertEqualsCanonicalizing(
            ['name' => 'required', 'supplier_id' => 'required', 'group_id' => 'required', 'unit_id' => 'required',
                'cost' => 'required'],
            $this->errorCodes($empty),
        );

        $bad = $this->api('POST', '/products', $this->adminToken, [
            'name' => str_repeat('a', 191),
            'supplier_id' => 'not-a-uuid',
            'group_id' => $this->groupId,
            'unit_id' => $this->unitId,
            'cost' => '12.34567',
            'description' => str_repeat('d', 2001),
        ]);
        self::assertEqualsCanonicalizing(
            ['name' => 'too_long', 'supplier_id' => 'invalid', 'cost' => 'invalid', 'description' => 'too_long'],
            $this->errorCodes($bad),
        );
    }

    public function testTheCostMustBeGreaterThanZeroAndFitThePriceFunction(): void
    {
        foreach (['0', '0.0000', '0.00'] as $zero) {
            $response = $this->api('POST', '/products', $this->adminToken, [
                'name' => 'Cero', 'supplier_id' => $this->supplierId, 'group_id' => $this->groupId,
                'unit_id' => $this->unitId, 'cost' => $zero,
            ]);
            self::assertSame(['cost' => 'out_of_range'], $this->errorCodes($response), $zero);
        }
        foreach (['-1', '1234567890', 'abc'] as $wrong) {
            $response = $this->api('POST', '/products', $this->adminToken, [
                'name' => 'Mal', 'supplier_id' => $this->supplierId, 'group_id' => $this->groupId,
                'unit_id' => $this->unitId, 'cost' => $wrong,
            ]);
            self::assertSame(['cost' => 'invalid'], $this->errorCodes($response), $wrong);
        }
        // A number is accepted like its string, as many JSON clients send it.
        self::assertSame('5.0000', $this->makeProduct('Entero', '5')['cost']);
    }

    public function testEveryReferenceMustExistAndBeActive(): void
    {
        $this->api('POST', '/suppliers/' . $this->supplierId . '/deactivate', $this->adminToken);
        $this->api('POST', '/units-of-measure/' . $this->unitId . '/deactivate', $this->adminToken);
        $brand = $this->makeParameter('/brands', ['name' => 'Retirada']);
        $this->api('POST', '/brands/' . $brand . '/deactivate', $this->adminToken);

        $response = $this->api('POST', '/products', $this->adminToken, [
            'name' => 'X', 'supplier_id' => $this->supplierId, 'group_id' => self::GONE, 'brand_id' => $brand,
            'unit_id' => $this->unitId, 'cost' => '1',
        ]);

        self::assertSame(422, $response->getStatusCode());
        self::assertEqualsCanonicalizing(
            ['supplier_id' => 'not_found', 'group_id' => 'not_found', 'brand_id' => 'not_found',
                'unit_id' => 'not_found'],
            $this->errorCodes($response),
        );
        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM products'));
    }

    public function testThePriceAlwaysStartsFromTheCostWhateverTheLevelAsked(): void
    {
        $id = $this->text($this->makeProduct('Precio', '22.96'), 'id');
        $levels = $this->rowsAt($this->json($this->api('GET', '/margin-levels', $this->adminToken)), 'data');
        $other = $this->text($levels[1], 'id');
        self::assertSame('Margen 35 %', $levels[1]['name']);

        $atDefault = $this->product($id);
        $atOther = $this->product($id, '?margin_level_id=' . $other);
        $atDefaultAgain = $this->product($id);

        self::assertSame('35.33', $atDefault['price_with_vat']);
        self::assertSame('Margen 35 %', $this->text($atOther, 'margin_level', 'name'));
        // The same cost at 35 %: 22.96 / ((1 - 0.35) * (1 - 0.03)) = 36.4155.
        self::assertSame('36.42', $atOther['price_with_vat']);
        // Asking for another level changed nothing stored, and the cost is untouched.
        self::assertSame($atDefault, $atDefaultAgain);
        self::assertSame('22.9600', $atOther['cost']);
        // The list prices every row the same way.
        $list = $this->json($this->api('GET', '/products?margin_level_id=' . $other, $this->adminToken));
        self::assertSame(['36.42'], $this->columnAt($list, 'price_with_vat', 'data'));
    }

    public function testAnUnknownOrInactiveLevelIsRefused(): void
    {
        $id = $this->text($this->makeProduct('Precio'), 'id');
        $levels = $this->rowsAt($this->json($this->api('GET', '/margin-levels', $this->adminToken)), 'data');
        $other = $this->text($levels[1], 'id');
        $this->api('POST', '/margin-levels/' . $other . '/deactivate', $this->adminToken);

        foreach (
            ['/products?margin_level_id=' . self::GONE, '/products?margin_level_id=' . $other,
            '/products/' . $id . '?margin_level_id=' . $other] as $path
        ) {
            $response = $this->api('GET', $path, $this->adminToken);
            self::assertSame(422, $response->getStatusCode(), $path);
            self::assertSame(['margin_level_id' => 'invalid'], $this->errorCodes($response), $path);
        }
    }

    public function testSavingWithoutChangingTheCostLeavesItsDateAlone(): void
    {
        $product = $this->makeProduct('Original', '10.5');
        $id = $this->text($product, 'id');
        $this->advance('+30 days');

        $response = $this->api('PATCH', '/products/' . $id, $this->adminToken, $this->editBody($product, [
            'name' => 'Renombrado', 'cost' => '10.5000', 'description' => 'nueva',
        ]));

        self::assertSame(200, $response->getStatusCode());
        $edited = $this->json($response);
        self::assertSame('Renombrado', $edited['name']);
        self::assertSame($product['cost_updated_at'], $edited['cost_updated_at']);
        self::assertSame(2, $edited['version']);
        $audit = $this->auditEntries('products', $id);
        self::assertSame(['create', 'update'], array_column($audit, 'action'));
        $changed = $this->valueAt($audit[1], 'after');
        self::assertIsArray($changed);
        self::assertEqualsCanonicalizing(['name', 'description'], array_keys($changed));
    }

    public function testChangingTheCostUpdatesItsDate(): void
    {
        $product = $this->makeProduct('Cambia', '10');
        $id = $this->text($product, 'id');
        $this->advance('+10 days');

        $edited = $this->json($this->api(
            'PATCH',
            '/products/' . $id,
            $this->adminToken,
            $this->editBody($product, ['cost' => '11.25']),
        ));

        self::assertSame('11.2500', $edited['cost']);
        self::assertNotSame($product['cost_updated_at'], $edited['cost_updated_at']);
        $audit = $this->auditEntries('products', $id);
        self::assertSame('update', $audit[1]['action']);
        self::assertSame('10.0000', $this->valueAt($audit[1], 'before', 'cost'));
        self::assertSame('11.2500', $this->valueAt($audit[1], 'after', 'cost'));
    }

    public function testCostReviewedMarksTheCostAsUpdatedWithoutChangingIt(): void
    {
        $product = $this->makeProduct('Revisado', '10');
        $id = $this->text($product, 'id');
        $this->advance('+95 days');
        self::assertTrue($this->product($id)['cost_is_stale']);

        $response = $this->api('PATCH', '/products/' . $id, $this->adminToken, $this->editBody($product, [
            'cost_reviewed' => true,
        ]));

        self::assertSame(200, $response->getStatusCode());
        $edited = $this->json($response);
        self::assertSame('10.0000', $edited['cost']);
        self::assertNotSame($product['cost_updated_at'], $edited['cost_updated_at']);
        self::assertFalse($edited['cost_is_stale']);
        // Nothing but the date moved, which the history calls a cost review and not an edit.
        self::assertSame(['create', 'cost_review'], array_column($this->auditEntries('products', $id), 'action'));
    }

    public function testTheCostGoesStaleAfterTheConfiguredDaysAndTheListCanFilterThem(): void
    {
        $old = $this->text($this->makeProduct('Viejo'), 'id');
        $this->advance('+60 days');
        $recent = $this->text($this->makeProduct('Reciente'), 'id');
        $this->advance('+31 days');

        // 91 days for the first, 31 for the second, with the 90 days of the settings.
        self::assertTrue($this->product($old)['cost_is_stale']);
        self::assertFalse($this->product($recent)['cost_is_stale']);
        $stale = $this->json($this->api('GET', '/products?stale=true', $this->adminToken));
        self::assertSame(['Viejo'], $this->columnAt($stale, 'name', 'data'));

        // The limit is the setting, read each time: nothing was stored.
        $settings = $this->json($this->api('GET', '/settings/financial', $this->adminToken));
        $this->api('PATCH', '/settings/financial', $this->adminToken, [
            'version' => $settings['version'],
            'vat_rate' => $settings['vat_rate'],
            'income_tax_rate' => $settings['income_tax_rate'],
            'stale_cost_days' => 20,
            'quote_validity_days' => $settings['quote_validity_days'],
        ]);
        $stale = $this->json($this->api('GET', '/products?stale=true', $this->adminToken));
        self::assertSame(['Reciente', 'Viejo'], $this->columnAt($stale, 'name', 'data'));
    }

    public function testEditingNeedsTheCurrentVersion(): void
    {
        $product = $this->makeProduct('Uno');
        $id = $this->text($product, 'id');
        $this->api('PATCH', '/products/' . $id, $this->adminToken, $this->editBody($product, ['name' => 'Dos']));

        $stale = $this->api(
            'PATCH',
            '/products/' . $id,
            $this->adminToken,
            $this->editBody($product, ['name' => 'Tres']),
        );

        self::assertSame(409, $stale->getStatusCode());
        self::assertSame('Dos', $this->product($id)['name']);
        self::assertSame(404, $this->statusOf('PATCH', '/products/' . self::GONE, null, $this->editBody($product)));
    }

    public function testAProductKeepsAReferenceThatWasSwitchedOffAfterwardsButCannotMoveToOne(): void
    {
        $product = $this->makeProduct('Con marca', '10', ['brand_id' => $this->brandId]);
        $id = $this->text($product, 'id');
        $this->api('POST', '/brands/' . $this->brandId . '/deactivate', $this->adminToken);
        $other = $this->makeParameter('/brands', ['name' => 'Otra']);
        $this->api('POST', '/brands/' . $other . '/deactivate', $this->adminToken);

        $kept = $this->api('PATCH', '/products/' . $id, $this->adminToken, $this->editBody($product, [
            'brand_id' => $this->brandId, 'name' => 'Sigue',
        ]));
        self::assertSame(200, $kept->getStatusCode());

        $moved = $this->api('PATCH', '/products/' . $id, $this->adminToken, $this->editBody($this->product($id), [
            'brand_id' => $other,
        ]));
        self::assertSame(['brand_id' => 'not_found'], $this->errorCodes($moved));
    }

    public function testListsWithFiltersSortedByNameAndPaged(): void
    {
        $otherSupplier = $this->makeSupplier('Aceros');
        $areas = $this->rowsAt($this->json($this->api('GET', '/areas', $this->adminToken)), 'data');
        $area = $this->text($areas[1], 'id');
        $otherGroup = $this->makeParameter('/product-groups', ['name' => 'Cables', 'area_id' => $area]);
        $this->makeProduct('Zeta', '1', ['brand_id' => $this->brandId]);
        $this->makeProduct('Alfa', '1', ['supplier_id' => $otherSupplier, 'group_id' => $otherGroup]);
        $gone = $this->text($this->makeProduct('Baja'), 'id');
        $this->api('POST', '/products/' . $gone . '/deactivate', $this->adminToken);

        $all = $this->json($this->api('GET', '/products', $this->adminToken));
        self::assertSame(['Alfa', 'Zeta'], $this->columnAt($all, 'name', 'data'));
        self::assertSame(2, $this->valueAt($all, 'meta', 'total'));

        $filters = [
            '?supplier_id=' . $otherSupplier => ['Alfa'],
            '?area_id=' . $area => ['Alfa'],
            '?group_id=' . $this->groupId => ['Zeta'],
            '?brand_id=' . $this->brandId => ['Zeta'],
            '?status=inactive' => ['Baja'],
            '?status=all&per_page=2&page=2' => ['Zeta'],
            '?q=PRD-0002' => ['Alfa'],
            '?q=lfa' => ['Alfa'],
        ];
        foreach ($filters as $query => $expected) {
            $found = $this->json($this->api('GET', '/products' . $query, $this->adminToken));
            self::assertSame($expected, $this->columnAt($found, 'name', 'data'), $query);
        }
    }

    public function testOrdersByTheChosenKeyAndGroupsByAreaAndGroupBeforeIt(): void
    {
        $areas = $this->rowsAt($this->json($this->api('GET', '/areas', $this->adminToken)), 'data');
        $otherArea = $this->text($areas[1], 'id');
        $otherGroup = $this->makeParameter('/product-groups', ['name' => 'Cables', 'area_id' => $otherArea]);
        $this->makeProduct('Zeta', '1');
        $this->advance('+1 hour');
        $this->makeProduct('Alfa', '30', ['group_id' => $otherGroup]);
        $this->advance('+1 hour');
        $this->makeProduct('Beta', '5');

        $orders = [
            '?sort=name' => ['Alfa', 'Beta', 'Zeta'],
            '?sort=code' => ['Zeta', 'Alfa', 'Beta'],
            '?sort=cost' => ['Zeta', 'Beta', 'Alfa'],
            '?sort=cost_review' => ['Zeta', 'Alfa', 'Beta'],
        ];
        foreach ($orders as $query => $expected) {
            $found = $this->json($this->api('GET', '/products' . $query, $this->adminToken));
            self::assertSame($expected, $this->columnAt($found, 'name', 'data'), $query);
        }

        $grouped = $this->json($this->api('GET', '/products?grouped=true&sort=cost', $this->adminToken));
        $areaNames = [];
        foreach ($this->rowsAt($grouped, 'data') as $row) {
            $name = $this->valueAt($row, 'area', 'name');
            self::assertIsString($name);
            $areaNames[] = $name;
        }
        $sorted = $areaNames;
        sort($sorted);
        self::assertSame($sorted, $areaNames, 'area is the first key');

        foreach (['?sort=price', '?grouped=yes'] as $query) {
            self::assertSame(422, $this->api('GET', '/products' . $query, $this->adminToken)->getStatusCode(), $query);
        }
    }

    public function testTheListSaysWhichCurrencyThePricesAreIn(): void
    {
        $list = $this->json($this->api('GET', '/products', $this->adminToken));

        self::assertSame('GTQ', $this->valueAt($list, 'meta', 'currency_code'));
    }

    public function testShowsAnInactiveProductAndAnUnknownOneIs404(): void
    {
        $id = $this->text($this->makeProduct('Uno'), 'id');
        $this->api('POST', '/products/' . $id . '/deactivate', $this->adminToken);

        self::assertFalse($this->product($id)['is_active']);
        self::assertSame(404, $this->statusOf('GET', '/products/' . self::GONE));
        self::assertSame(404, $this->statusOf('GET', '/products/not-a-uuid'));
    }

    public function testDeactivateAndReactivateAreIdempotentAndAudited(): void
    {
        $id = $this->text($this->makeProduct('Uno'), 'id');

        foreach ([1, 2] as $_) {
            $off = $this->json($this->api('POST', '/products/' . $id . '/deactivate', $this->adminToken));
            self::assertFalse($off['is_active']);
            self::assertSame('manual', $off['deactivation_reason']);
        }
        foreach ([1, 2] as $_) {
            $on = $this->json($this->api('POST', '/products/' . $id . '/reactivate', $this->adminToken));
            self::assertTrue($on['is_active']);
            self::assertNull($on['deactivation_reason']);
        }

        self::assertSame(
            ['create', 'deactivate', 'reactivate'],
            array_column($this->auditEntries('products', $id), 'action'),
        );
        self::assertSame(404, $this->statusOf('POST', '/products/' . self::GONE . '/deactivate'));
        self::assertSame(404, $this->statusOf('POST', '/products/' . self::GONE . '/reactivate'));
    }

    public function testAProductIsNotReactivatedWhileItsSupplierIsDeactivated(): void
    {
        $id = $this->text($this->makeProduct('Uno'), 'id');
        $this->api('POST', '/suppliers/' . $this->supplierId . '/deactivate', $this->adminToken);

        $response = $this->api('POST', '/products/' . $id . '/reactivate', $this->adminToken);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame(['supplier_id' => 'parent_inactive'], $this->errorCodes($response));
        self::assertFalse($this->product($id)['is_active']);
    }

    public function testTheMigrationCanBeRepeatedWithoutDuplicatingAnything(): void
    {
        $this->applyMigrationAgain('20261014000002');

        self::assertSame(81, $this->countRows('SELECT COUNT(*) FROM role_permissions'));
        self::assertSame(1, $this->countRows("SELECT COUNT(*) FROM sequences WHERE code = 'product'"));
        self::assertSame(1, $this->countRows("SELECT COUNT(*) FROM resources WHERE code = 'products' AND scoped = 0"));
    }
}
