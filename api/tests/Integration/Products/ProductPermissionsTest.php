<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Products;

/** ADR-0024: each action needs its own permission, and the lists a form chooses from need none of the section. */
final class ProductPermissionsTest extends ProductsTestCase
{
    public function testEveryActionNeedsItsOwnPermission(): void
    {
        $product = $this->makeProduct('Uno');
        $id = $this->text($product, 'id');
        $body = $this->editBody($product);
        $create = [
            'name' => 'X', 'supplier_id' => $this->supplierId, 'group_id' => $this->groupId,
            'unit_id' => $this->unitId, 'cost' => '1',
        ];
        $viewer = $this->tokenWith('products', 'view');

        self::assertSame(200, $this->statusOf('GET', '/products', $viewer));
        self::assertSame(200, $this->statusOf('GET', '/products/' . $id, $viewer));
        $denied = [
            ['POST', '/products', $create],
            ['PATCH', '/products/' . $id, $body],
            ['POST', '/products/' . $id . '/deactivate', null],
            ['POST', '/products/' . $id . '/reactivate', null],
            ['POST', '/products/' . $id . '/confirm-cost', null],
            ['POST', '/products/deactivate', ['ids' => [$id]]],
            ['POST', '/products/reactivate', ['ids' => [$id]]],
            ['POST', '/products/confirm-cost', ['ids' => [$id]]],
        ];
        foreach ($denied as [$method, $path, $payload]) {
            self::assertSame(403, $this->statusOf($method, $path, $viewer, $payload), $method . ' ' . $path);
        }
        self::assertSame(401, $this->statusOf('GET', '/products', ''));
    }

    public function testConfirmingTheCostIsAnEditAndNotADeactivation(): void
    {
        $id = $this->text($this->makeProduct('Uno'), 'id');
        $editor = $this->tokenWith('products', 'view', 'edit');
        $deactivator = $this->tokenWith('products', 'view', 'deactivate');

        self::assertSame(200, $this->statusOf('POST', '/products/' . $id . '/confirm-cost', $editor));
        self::assertSame(200, $this->statusOf('POST', '/products/confirm-cost', $editor, ['ids' => [$id]]));
        self::assertSame(403, $this->statusOf('POST', '/products/' . $id . '/confirm-cost', $deactivator));
        self::assertSame(403, $this->statusOf('POST', '/products/' . $id . '/deactivate', $editor));
        self::assertSame(200, $this->statusOf('POST', '/products/' . $id . '/deactivate', $deactivator));
        self::assertSame(200, $this->statusOf('POST', '/products/deactivate', $deactivator, ['ids' => [$id]]));
    }

    public function testWhoOnlyViewsProductsFillsTheirFormsFromTheOptionsWithoutAccessToTheirSections(): void
    {
        $viewer = $this->tokenWith('products', 'view');

        $paths = ['/brands', '/product-groups', '/units-of-measure', '/areas', '/suppliers', '/margin-levels'];
        foreach ($paths as $path) {
            self::assertSame(403, $this->statusOf('GET', $path, $viewer), $path);
            self::assertSame(200, $this->statusOf('GET', $path . '/options', $viewer), $path . '/options');
        }
    }

    public function testCreatingABrandOrAGroupFromTheProductScreenNeedsTheCreatePermissionOfThatSection(): void
    {
        $editor = $this->tokenWith('products', 'view', 'create', 'edit');

        self::assertSame(403, $this->statusOf('POST', '/brands', $editor, ['name' => 'Nueva']));
        self::assertSame(403, $this->statusOf('POST', '/product-groups', $editor, [
            'name' => 'Nuevo', 'area_id' => $this->text($this->firstOf('/areas'), 'id'),
        ]));
        $maker = $this->tokenWith('brands', 'view', 'create');
        self::assertSame(201, $this->statusOf('POST', '/brands', $maker, ['name' => 'Nueva']));
    }

    public function testAProfileWithActionsButNoViewIsNotSaved(): void
    {
        $role = $this->createRole('Productos', ['products' => ['view']]);

        $response = $this->api('PATCH', '/roles/' . $role, $this->adminToken, [
            'version' => 1,
            'permissions' => ['products' => ['create', 'edit', 'deactivate']],
        ]);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame('view_required', $this->errorCodes($response)['permissions.products'] ?? null);
    }
}
