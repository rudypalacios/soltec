<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Products;

/** Bundles are compound products: their cost and price come from their components and are never stored. */
final class BundlesTest extends ProductsTestCase
{
    /**
     * @param list<array{product_id: string, quantity: string}> $items
     * @param array<string, mixed> $extra
     * @return array<array-key, mixed>
     */
    private function makeBundle(string $name, array $items, array $extra = []): array
    {
        $response = $this->api('POST', '/bundles', $this->adminToken, $extra + [
            'name' => $name,
            'group_id' => $this->groupId,
            'items' => $items,
        ]);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return $this->json($response);
    }

    /** @return array{product_id: string, quantity: string} */
    private function line(string $productId, string $quantity): array
    {
        return ['product_id' => $productId, 'quantity' => $quantity];
    }

    /**
     * @param list<array<array-key, mixed>> $items
     * @return list<string>
     */
    private function componentNames(array $items): array
    {
        return array_map(fn (array $item): string => $this->text($item, 'product', 'name'), $items);
    }

    /** @return array<array-key, mixed> */
    private function bundle(string $id, string $query = ''): array
    {
        return $this->json($this->api('GET', '/bundles/' . $id . $query, $this->adminToken));
    }

    public function testCreatesABundleWithTheCostAndPriceItsComponentsAddUpTo(): void
    {
        $cable = $this->text($this->makeProduct('Cable', '22.96'), 'id');
        $jack = $this->text($this->makeProduct('Jack', '1.25'), 'id');

        $bundle = $this->makeBundle('  Punto de red ', [$this->line($cable, '18'), $this->line($jack, '4.5')], [
            'description' => 'Cable y jacks',
            'brand_id' => $this->brandId,
        ]);

        self::assertSame('PAQ-0001', $bundle['code']);
        self::assertSame('Punto de red', $bundle['name']);
        self::assertSame('Conectores', $this->text($bundle, 'group', 'name'));
        self::assertSame('Aire Acondicionado', $this->text($bundle, 'area', 'name'));
        self::assertSame('Panduit', $this->text($bundle, 'brand', 'name'));
        // 18 × 22.96 + 4.5 × 1.25 = 413.28 + 5.625, rounded once to four decimals.
        self::assertSame('418.9050', $bundle['cost']);
        self::assertSame(2, $bundle['component_count']);
        self::assertFalse($bundle['has_inactive_components']);
        self::assertFalse($bundle['cost_is_stale']);
        self::assertTrue($bundle['is_active']);
        self::assertSame('Cables del Sur', $this->text($bundle, 'suppliers', '0', 'name'));
        self::assertCount(1, $this->rowsAt($bundle, 'suppliers'));

        $items = $this->rowsAt($bundle, 'items');
        self::assertSame(['Cable', 'Jack'], $this->componentNames($items));
        self::assertSame('18.000', $items[0]['quantity']);
        self::assertSame('22.9600', $items[0]['cost']);
        self::assertSame('413.2800', $items[0]['line_cost']);
        self::assertSame('Caja', $this->text($items[0], 'unit', 'name'));

        // The price is the same function as a product's, on the summed cost: one component, one unit, same price.
        $same = $this->makeBundle('Solo cable', [$this->line($cable, '1')]);
        self::assertSame($this->product($cable)['price_with_vat'], $same['price_with_vat']);
        self::assertSame($this->product($cable)['price_without_vat'], $same['price_without_vat']);

        $audit = $this->auditEntries('bundles', $this->text($bundle, 'id'));
        self::assertSame(['create'], array_column($audit, 'action'));
        self::assertSame(
            'Punto de red',
            $this->connection->fetchOne("SELECT entity_label FROM audit_logs WHERE entity_type = 'bundles' LIMIT 1"),
        );
    }

    public function testACostChangeInProductsReachesTheBundleWithoutSavingAnything(): void
    {
        $cable = $this->makeProduct('Cable', '10');
        $id = $this->text($this->makeBundle('Paquete', [$this->line($this->text($cable, 'id'), '2')]), 'id');
        self::assertSame('20.0000', $this->bundle($id)['cost']);

        $this->api(
            'PATCH',
            '/products/' . $this->text($cable, 'id'),
            $this->adminToken,
            $this->editBody($cable, ['cost' => '15']),
        );

        self::assertSame('30.0000', $this->bundle($id)['cost']);
        self::assertSame(1, $this->bundle($id)['version']);
    }

    public function testValidatesTheFieldsAndTheComponents(): void
    {
        $active = $this->text($this->makeProduct('Activo'), 'id');
        $off = $this->text($this->makeProduct('Baja'), 'id');
        $this->api('POST', '/products/' . $off . '/deactivate', $this->adminToken);
        $base = ['name' => 'Paquete', 'group_id' => $this->groupId, 'items' => [$this->line($active, '1')]];

        $cases = [
            'no name' => [['name' => ''] + $base, ['name' => 'required']],
            'no group' => [['group_id' => null] + $base, ['group_id' => 'required']],
            'no items' => [['items' => []] + $base, ['items' => 'required']],
            'items missing' => [array_diff_key($base, ['items' => 1]), ['items' => 'required']],
            'zero quantity' => [
                ['items' => [$this->line($active, '0')]] + $base,
                ['items.0.quantity' => 'out_of_range'],
            ],
            'four decimals' => [
                ['items' => [$this->line($active, '1.0001')]] + $base,
                ['items.0.quantity' => 'invalid'],
            ],
            'the same product twice' => [
                ['items' => [$this->line($active, '1'), $this->line($active, '2')]] + $base,
                ['items.1.product_id' => 'duplicate'],
            ],
            'a deactivated product' => [
                ['items' => [$this->line($active, '1'), $this->line($off, '1')]] + $base,
                ['items.1.product_id' => 'not_found'],
            ],
            'an unknown product' => [
                ['items' => [$this->line(self::GONE, '1')]] + $base,
                ['items.0.product_id' => 'not_found'],
            ],
            'an unknown group' => [['group_id' => self::GONE] + $base, ['group_id' => 'not_found']],
            'an unknown brand' => [['brand_id' => self::GONE] + $base, ['brand_id' => 'not_found']],
        ];
        foreach ($cases as $label => [$body, $expected]) {
            $response = $this->api('POST', '/bundles', $this->adminToken, $body);
            self::assertSame(422, $response->getStatusCode(), $label);
            self::assertSame($expected, $this->errorCodes($response), $label);
        }
        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM bundles'));
    }

    public function testEditingReplacesTheComponentsAndNeedsTheCurrentVersion(): void
    {
        $one = $this->text($this->makeProduct('Uno', '10'), 'id');
        $two = $this->text($this->makeProduct('Dos', '5'), 'id');
        $bundle = $this->makeBundle('Paquete', [$this->line($one, '1')]);
        $id = $this->text($bundle, 'id');

        $edit = $this->api('PATCH', '/bundles/' . $id, $this->adminToken, [
            'version' => $bundle['version'],
            'name' => 'Paquete grande',
            'group_id' => $this->groupId,
            'items' => [$this->line($two, '3'), $this->line($one, '2.5')],
        ]);
        self::assertSame(200, $edit->getStatusCode(), (string) $edit->getBody());
        $edited = $this->json($edit);

        self::assertSame(2, $edited['version']);
        self::assertSame('Paquete grande', $edited['name']);
        // 3 × 5 + 2.5 × 10, in the order they were listed.
        self::assertSame('40.0000', $edited['cost']);
        self::assertSame(['Dos', 'Uno'], $this->componentNames($this->rowsAt($edited, 'items')));

        $stale = $this->api('PATCH', '/bundles/' . $id, $this->adminToken, [
            'version' => 1,
            'name' => 'X',
            'group_id' => $this->groupId,
            'items' => [$this->line($one, '1')],
        ]);
        self::assertSame(409, $stale->getStatusCode());

        $audit = $this->auditEntries('bundles', $id);
        self::assertSame(['create', 'update'], array_column($audit, 'action'));
        $after = $this->valueAt($audit[1], 'after');
        self::assertIsArray($after);
        self::assertEqualsCanonicalizing(['name', 'items'], array_keys($after));
        self::assertSame(404, $this->statusOf('PATCH', '/bundles/' . self::GONE, null, [
            'version' => 1, 'name' => 'X', 'group_id' => $this->groupId, 'items' => [$this->line($one, '1')],
        ]));
    }

    public function testADeactivatedComponentStaysAndTheBundleSaysSo(): void
    {
        $one = $this->text($this->makeProduct('Uno', '10', ['check_availability' => true]), 'id');
        $two = $this->text($this->makeProduct('Dos', '5'), 'id');
        $bundle = $this->makeBundle('Paquete', [$this->line($one, '1'), $this->line($two, '1')]);
        $id = $this->text($bundle, 'id');
        self::assertTrue($bundle['check_availability']);

        $this->api('POST', '/products/' . $two . '/deactivate', $this->adminToken);
        $read = $this->bundle($id);

        self::assertTrue($read['has_inactive_components']);
        self::assertSame(1, $read['inactive_component_count']);
        self::assertTrue($read['is_active']);
        // Its price still adds up every component, switched off or not.
        self::assertSame('15.0000', $read['cost']);
        self::assertFalse($this->rowsAt($read, 'items')[1]['is_active']);

        // Saving it again keeps the component it already had, though it is switched off; a new one must be active.
        $keep = $this->api('PATCH', '/bundles/' . $id, $this->adminToken, [
            'version' => $read['version'], 'name' => 'Paquete', 'group_id' => $this->groupId,
            'items' => [$this->line($one, '1'), $this->line($two, '1')],
        ]);
        self::assertSame(200, $keep->getStatusCode(), (string) $keep->getBody());
    }

    public function testTheCostGoesStaleWhenAnyComponentDoes(): void
    {
        $old = $this->text($this->makeProduct('Viejo', '10'), 'id');
        $id = $this->text($this->makeBundle('Paquete', [$this->line($old, '1')]), 'id');
        $this->advance('+100 days');
        $fresh = $this->text($this->makeProduct('Nuevo', '10'), 'id');
        $other = $this->text($this->makeBundle('Fresco', [$this->line($fresh, '1')]), 'id');

        self::assertTrue($this->bundle($id)['cost_is_stale']);
        self::assertFalse($this->bundle($other)['cost_is_stale']);
        $stale = $this->json($this->api('GET', '/bundles?stale=true', $this->adminToken));
        self::assertSame(['Paquete'], $this->columnAt($stale, 'name', 'data'));
    }

    public function testListsWithFiltersSearchesInsideTheBundleAndSorts(): void
    {
        $otherSupplier = $this->makeSupplier('Aceros');
        $areas = $this->rowsAt($this->json($this->api('GET', '/areas', $this->adminToken)), 'data');
        $otherGroup = $this->makeParameter(
            '/product-groups',
            ['name' => 'Cables', 'area_id' => $this->text($areas[1], 'id')],
        );
        $cable = $this->text($this->makeProduct('Patch Cord UTP', '20'), 'id');
        $steel = $this->text($this->makeProduct('Varilla', '5', ['supplier_id' => $otherSupplier]), 'id');
        $this->makeBundle('Zeta', [$this->line($cable, '1')], ['brand_id' => $this->brandId]);
        $this->makeBundle('Alfa', [$this->line($steel, '10')], ['group_id' => $otherGroup]);
        $gone = $this->text($this->makeBundle('Baja', [$this->line($cable, '2')]), 'id');
        $this->api('POST', '/bundles/' . $gone . '/deactivate', $this->adminToken);

        $all = $this->json($this->api('GET', '/bundles', $this->adminToken));
        self::assertSame(['Alfa', 'Zeta'], $this->columnAt($all, 'name', 'data'));
        self::assertSame(2, $this->valueAt($all, 'meta', 'total'));
        self::assertSame('GTQ', $this->valueAt($all, 'meta', 'currency_code'));

        $filters = [
            '?supplier_id=' . $otherSupplier => ['Alfa'],
            '?group_id=' . $otherGroup => ['Alfa'],
            '?brand_id=' . $this->brandId => ['Zeta'],
            '?status=inactive' => ['Baja'],
            '?status=all&per_page=2&page=2' => ['Zeta'],
            '?q=PAQ-0002' => ['Alfa'],
            '?q=lfa' => ['Alfa'],
            '?q=patch' => ['Zeta'],
            '?sort=cost' => ['Zeta', 'Alfa'],
            '?sort=code' => ['Zeta', 'Alfa'],
        ];
        foreach ($filters as $query => $expected) {
            $found = $this->json($this->api('GET', '/bundles' . $query, $this->adminToken));
            self::assertSame($expected, $this->columnAt($found, 'name', 'data'), $query);
        }

        // A search that matches a component says which one; one that matches the bundle itself has nothing to say.
        $inside = $this->rowsAt($this->json($this->api('GET', '/bundles?q=patch', $this->adminToken)), 'data');
        self::assertSame('Patch Cord UTP', $this->text($inside[0], 'matched_component', 'name'));
        $own = $this->rowsAt($this->json($this->api('GET', '/bundles?q=zeta', $this->adminToken)), 'data');
        self::assertNull($own[0]['matched_component']);

        $grouped = $this->json($this->api('GET', '/bundles?grouped=true', $this->adminToken));
        self::assertSame(['Zeta', 'Alfa'], $this->columnAt($grouped, 'name', 'data'));
        foreach (['?sort=price', '?grouped=yes'] as $query) {
            self::assertSame(422, $this->statusOf('GET', '/bundles' . $query), $query);
        }
    }

    public function testThePriceAlwaysStartsFromTheCostWhateverTheLevelAsked(): void
    {
        $cable = $this->text($this->makeProduct('Cable', '22.96'), 'id');
        $id = $this->text($this->makeBundle('Paquete', [$this->line($cable, '1')]), 'id');
        $levels = $this->rowsAt($this->json($this->api('GET', '/margin-levels', $this->adminToken)), 'data');
        $other = null;
        foreach ($levels as $level) {
            if ($level['is_default'] === false) {
                $other = $this->text($level, 'id');
            }
        }
        self::assertNotNull($other);

        $atOther = $this->bundle($id, '?margin_level_id=' . $other);

        $product = $this->product($cable, '?margin_level_id=' . $other);
        self::assertSame($product['price_with_vat'], $atOther['price_with_vat']);
        self::assertSame(422, $this->statusOf('GET', '/bundles/' . $id . '?margin_level_id=' . self::GONE));
    }

    public function testDeactivateAndReactivateAreIdempotentAndAudited(): void
    {
        $cable = $this->text($this->makeProduct('Cable'), 'id');
        $id = $this->text($this->makeBundle('Paquete', [$this->line($cable, '1')]), 'id');

        foreach ([1, 2] as $_) {
            $off = $this->json($this->api('POST', '/bundles/' . $id . '/deactivate', $this->adminToken));
            self::assertFalse($off['is_active']);
        }
        foreach ([1, 2] as $_) {
            $on = $this->json($this->api('POST', '/bundles/' . $id . '/reactivate', $this->adminToken));
            self::assertTrue($on['is_active']);
        }

        self::assertSame(
            ['create', 'deactivate', 'reactivate'],
            array_column($this->auditEntries('bundles', $id), 'action'),
        );
        self::assertSame(404, $this->statusOf('POST', '/bundles/' . self::GONE . '/deactivate'));
    }

    public function testDeactivatesAndReactivatesSeveralWithOneEntryEachAndCountsWhatWasAlreadyAsked(): void
    {
        $cable = $this->text($this->makeProduct('Cable'), 'id');
        [$a, $b, $c] = array_map(
            fn (string $name): string => $this->text($this->makeBundle($name, [$this->line($cable, '1')]), 'id'),
            ['Uno', 'Dos', 'Tres'],
        );
        $this->api('POST', '/bundles/' . $c . '/deactivate', $this->adminToken);

        $off = $this->api('POST', '/bundles/deactivate', $this->adminToken, ['ids' => [$a, $b, $c]]);

        self::assertSame(200, $off->getStatusCode());
        self::assertSame(['affected' => 2, 'unchanged' => 1, 'blocked' => 0], $this->json($off));
        foreach ([$a, $b] as $id) {
            self::assertFalse($this->bundle($id)['is_active']);
            self::assertSame(['create', 'deactivate'], array_column($this->auditEntries('bundles', $id), 'action'));
            self::assertSame(2, $this->bundle($id)['version']);
        }
        // The one already off was not touched again.
        self::assertSame(['create', 'deactivate'], array_column($this->auditEntries('bundles', $c), 'action'));

        $on = $this->api('POST', '/bundles/reactivate', $this->adminToken, ['ids' => [$a, $b, $c]]);

        self::assertSame(['affected' => 3, 'unchanged' => 0, 'blocked' => 0], $this->json($on));
        self::assertTrue($this->bundle($a)['is_active']);
        $again = $this->api('POST', '/bundles/reactivate', $this->adminToken, ['ids' => [$a]]);
        self::assertSame(['affected' => 0, 'unchanged' => 1, 'blocked' => 0], $this->json($again));
    }

    public function testReactivatingLeavesBlockedTheBundlesWhoseGroupIsOff(): void
    {
        $cable = $this->text($this->makeProduct('Cable'), 'id');
        $areaId = $this->text($this->firstOf('/areas'), 'id');
        $otherGroup = $this->makeParameter('/product-groups', ['name' => 'Otro', 'area_id' => $areaId]);
        $kept = $this->text($this->makeBundle('Uno', [$this->line($cable, '1')]), 'id');
        $blocked = $this->text(
            $this->makeBundle('Dos', [$this->line($cable, '1')], ['group_id' => $otherGroup]),
            'id',
        );
        $this->api('POST', '/bundles/deactivate', $this->adminToken, ['ids' => [$kept, $blocked]]);
        $this->api('POST', '/product-groups/' . $otherGroup . '/deactivate', $this->adminToken);

        $response = $this->api('POST', '/bundles/reactivate', $this->adminToken, ['ids' => [$kept, $blocked]]);

        self::assertSame(['affected' => 1, 'unchanged' => 0, 'blocked' => 1], $this->json($response));
        self::assertTrue($this->bundle($kept)['is_active']);
        self::assertFalse($this->bundle($blocked)['is_active']);
    }

    public function testAnUnknownIdFailsTheWholeBulkCallAndTheListIsValidated(): void
    {
        $cable = $this->text($this->makeProduct('Cable'), 'id');
        $id = $this->text($this->makeBundle('Uno', [$this->line($cable, '1')]), 'id');
        $tooMany = array_map(fn (int $n): string => sprintf('0192a1b2-0000-7000-8000-%012d', $n), range(1, 501));

        $unknown = $this->api('POST', '/bundles/deactivate', $this->adminToken, ['ids' => [$id, self::GONE]]);
        self::assertSame(422, $unknown->getStatusCode());
        self::assertSame(['ids' => 'not_found'], $this->errorCodes($unknown));
        self::assertTrue($this->bundle($id)['is_active']);

        $cases = [
            'missing' => [[], ['ids' => 'required']],
            'empty' => [['ids' => []], ['ids' => 'required']],
            'duplicated' => [['ids' => [$id, $id]], ['ids' => 'invalid']],
            'not a uuid' => [['ids' => ['x']], ['ids' => 'invalid']],
            'too many' => [['ids' => $tooMany], ['ids' => 'too_many']],
        ];
        foreach (['/bundles/deactivate', '/bundles/reactivate'] as $path) {
            foreach ($cases as $label => [$body, $errors]) {
                $response = $this->api('POST', $path, $this->adminToken, $body);
                self::assertSame($errors, $this->errorCodes($response), $path . ' ' . $label);
            }
        }
    }

    public function testCandidatesAreActiveProductsWithTheirCostWithoutTheOnesAlreadyIn(): void
    {
        $cable = $this->text($this->makeProduct('Cable UTP', '22.96'), 'id');
        $this->makeProduct('Cable coaxial', '9.5');
        $off = $this->text($this->makeProduct('Cable viejo'), 'id');
        $this->api('POST', '/products/' . $off . '/deactivate', $this->adminToken);

        $found = $this->json($this->api('GET', '/bundles/candidates?q=cable', $this->adminToken));
        self::assertSame(['Cable coaxial', 'Cable UTP'], $this->columnAt($found, 'name', 'data'));
        $first = $this->rowsAt($found, 'data')[0];
        self::assertSame('9.5000', $first['cost']);
        self::assertSame('Caja', $this->text($first, 'unit', 'name'));

        $without = $this->json($this->api('GET', '/bundles/candidates?q=cable&exclude=' . $cable, $this->adminToken));
        self::assertSame(['Cable coaxial'], $this->columnAt($without, 'name', 'data'));
        self::assertSame(422, $this->statusOf('GET', '/bundles/candidates?exclude=no-es-un-id'));
        self::assertSame(422, $this->statusOf('GET', '/bundles/candidates?limit=0'));
    }

    public function testEveryActionNeedsItsOwnPermission(): void
    {
        $cable = $this->text($this->makeProduct('Cable'), 'id');
        $bundle = $this->makeBundle('Paquete', [$this->line($cable, '1')]);
        $id = $this->text($bundle, 'id');
        $create = ['name' => 'X', 'group_id' => $this->groupId, 'items' => [$this->line($cable, '1')]];
        $viewer = $this->tokenWith('bundles', 'view');

        // Whoever sees bundles sees their costs, and the products to build them from.
        $read = $this->json($this->api('GET', '/bundles/' . $id, $viewer));
        self::assertSame('22.9600', $read['cost']);
        self::assertSame(200, $this->statusOf('GET', '/bundles', $viewer));
        self::assertSame(200, $this->statusOf('GET', '/bundles/candidates', $viewer));
        $denied = [
            ['POST', '/bundles', $create],
            ['PATCH', '/bundles/' . $id, $create + ['version' => 1]],
            ['POST', '/bundles/' . $id . '/deactivate', null],
            ['POST', '/bundles/' . $id . '/reactivate', null],
            ['POST', '/bundles/deactivate', ['ids' => [$id]]],
            ['POST', '/bundles/reactivate', ['ids' => [$id]]],
        ];
        foreach ($denied as [$method, $path, $payload]) {
            self::assertSame(403, $this->statusOf($method, $path, $viewer, $payload), $method . ' ' . $path);
        }
        // Seeing products is not seeing bundles.
        self::assertSame(403, $this->statusOf('GET', '/bundles', $this->tokenWith('products', 'view')));
        self::assertSame(401, $this->statusOf('GET', '/bundles', ''));
    }

    public function testTheMigrationCanBeRepeatedWithoutDuplicatingAnything(): void
    {
        $this->applyMigrationAgain('20261014000003');

        self::assertSame(85, $this->countRows('SELECT COUNT(*) FROM role_permissions'));
        self::assertSame(1, $this->countRows("SELECT COUNT(*) FROM sequences WHERE code = 'bundle'"));
        self::assertSame(1, $this->countRows("SELECT COUNT(*) FROM resources WHERE code = 'bundles' AND scoped = 0"));
    }
}
