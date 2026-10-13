<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Catalog;

use Soltec\Kernel\Uuid;
use Soltec\Tests\Integration\Access\AccessTestCase;

/** What the lists of the product structure add to the generic ones: groups under areas, units under categories. */
final class CatalogStructureTest extends AccessTestCase
{
    private string $adminToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminToken = $this->tokenFor($this->createAdmin()['id']);
    }

    public function testTheMigrationSeedsAreasCategoriesAndUnits(): void
    {
        $names = fn (string $slug): array => $this->columnAt(
            $this->json($this->api('GET', '/' . $slug . '?per_page=100', $this->adminToken)),
            'name',
            'data',
        );

        self::assertSame(['Aire Acondicionado', 'Cableado', 'Electricidad', 'Equipo', 'Otros'], $names('areas'));
        self::assertSame(['Cantidad', 'Longitud', 'Peso', 'Superficie', 'Volumen'], $names('unit-categories'));
        self::assertCount(17, $names('units-of-measure'));
        self::assertSame([], $names('brands'));
        self::assertSame([], $names('product-groups'));

        $length = $this->categoryId('Longitud');
        $path = '/units-of-measure?per_page=100&category_id=' . $length;
        $units = $this->json($this->api('GET', $path, $this->adminToken));
        self::assertSame(
            ['Centímetro', 'Metro', 'Milímetro', 'Pie', 'Pulgada'],
            $this->columnAt($units, 'name', 'data'),
        );
    }

    public function testAGroupBelongsToAnAreaAndShowsIt(): void
    {
        $area = $this->areaId('Cableado');

        $body = ['name' => 'Conectores', 'area_id' => $area];
        $response = $this->api('POST', '/product-groups', $this->adminToken, $body);

        self::assertSame(201, $response->getStatusCode());
        $group = $this->json($response);
        self::assertSame(['id' => $area, 'name' => 'Cableado'], $group['area']);
        self::assertArrayNotHasKey('area_id', $group);
        $audit = $this->auditEntries('product_groups', $this->text($group, 'id'));
        self::assertSame(['name' => 'Conectores', 'area_id' => $area, 'is_active' => true], $audit[0]['after']);
    }

    public function testTheAreaIsRequiredAndMustExistAndBeActive(): void
    {
        $missing = $this->api('POST', '/product-groups', $this->adminToken, ['name' => 'Sin área']);
        self::assertSame(['area_id' => 'required'], $this->errorCodes($missing));

        $unknown = $this->api('POST', '/product-groups', $this->adminToken, [
            'name' => 'Huérfano',
            'area_id' => '0192a1b2-0000-7000-8000-000000000000',
        ]);
        self::assertSame(['area_id' => 'not_found'], $this->errorCodes($unknown));

        $malformed = $this->api('POST', '/product-groups', $this->adminToken, ['name' => 'x', 'area_id' => 'nope']);
        self::assertSame(['area_id' => 'invalid'], $this->errorCodes($malformed));

        $retired = $this->createArea('Retirada', active: false);
        $inactive = $this->api('POST', '/product-groups', $this->adminToken, ['name' => 'x', 'area_id' => $retired]);
        self::assertSame(['area_id' => 'not_found'], $this->errorCodes($inactive));
    }

    public function testAGroupNameRepeatsAcrossAreasButNotWithinOne(): void
    {
        $wiring = $this->areaId('Cableado');
        $power = $this->areaId('Electricidad');
        $this->createGroup($wiring, 'Accesorios');

        $elsewhere = ['name' => 'Accesorios', 'area_id' => $power];
        $other = $this->api('POST', '/product-groups', $this->adminToken, $elsewhere);
        self::assertSame(201, $other->getStatusCode());

        $repeated = ['name' => 'ACCESORIOS', 'area_id' => $wiring];
        $same = $this->api('POST', '/product-groups', $this->adminToken, $repeated);
        self::assertSame(['name' => 'taken'], $this->errorCodes($same));
    }

    public function testUnitNamesAreUniqueInTheWholeTable(): void
    {
        $response = $this->api('POST', '/units-of-measure', $this->adminToken, [
            'name' => 'metro',
            'category_id' => $this->categoryId('Peso'),
        ]);

        self::assertSame(['name' => 'taken'], $this->errorCodes($response));
    }

    public function testUnitNamesAreLimitedToSixtyCharacters(): void
    {
        $response = $this->api('POST', '/units-of-measure', $this->adminToken, [
            'name' => str_repeat('a', 61),
            'category_id' => $this->categoryId('Peso'),
        ]);

        self::assertSame(['name' => 'too_long'], $this->errorCodes($response));
    }

    public function testListsFilterByParentAndCountActiveChildren(): void
    {
        $wiring = $this->areaId('Cableado');
        $power = $this->areaId('Electricidad');
        $this->createGroup($wiring, 'Conectores');
        $this->createGroup($wiring, 'Cables');
        $this->createGroup($wiring, 'Retirado', active: false);
        $this->createGroup($power, 'Breakers');

        $groups = $this->json($this->api('GET', '/product-groups?area_id=' . $wiring, $this->adminToken));
        self::assertSame(['Cables', 'Conectores'], $this->columnAt($groups, 'name', 'data'));

        $areas = $this->json($this->api('GET', '/areas?per_page=100', $this->adminToken));
        $counts = array_column($this->rowsAt($areas, 'data'), 'active_group_count', 'name');
        self::assertSame(2, $counts['Cableado']);
        self::assertSame(1, $counts['Electricidad']);
        self::assertSame(0, $counts['Otros']);
    }

    public function testAnAreaWithActiveGroupsCannotBeDeactivatedAndTheErrorSaysHowMany(): void
    {
        $area = $this->areaId('Cableado');
        $one = $this->createGroup($area, 'Conectores');
        $this->createGroup($area, 'Cables');

        $response = $this->api('POST', '/areas/' . $area . '/deactivate', $this->adminToken);

        self::assertSame(409, $response->getStatusCode());
        $problem = $this->json($response);
        self::assertSame('area_in_use', $problem['code']);
        self::assertSame(2, $problem['active_group_count']);
        self::assertSame([], $this->auditEntries('areas', $area));

        // Once its groups are inactive the area can go.
        $this->api('POST', '/product-groups/' . $one . '/deactivate', $this->adminToken);
        $still = $this->json($this->api('POST', '/areas/' . $area . '/deactivate', $this->adminToken));
        self::assertSame(1, $this->valueAt($still, 'active_group_count'));
    }

    public function testACategoryWithActiveUnitsCannotBeDeactivated(): void
    {
        $category = $this->categoryId('Peso');

        $response = $this->api('POST', '/unit-categories/' . $category . '/deactivate', $this->adminToken);

        self::assertSame(409, $response->getStatusCode());
        self::assertSame('unit_category_in_use', $this->json($response)['code']);
        self::assertSame(4, $this->json($response)['active_unit_count']);
    }

    public function testDeactivatingAnEmptyAreaAndItsLastGroupInOrder(): void
    {
        $area = $this->createArea('Temporal');
        $group = $this->createGroup($area, 'Pasajero');

        $this->api('POST', '/product-groups/' . $group . '/deactivate', $this->adminToken);
        $response = $this->api('POST', '/areas/' . $area . '/deactivate', $this->adminToken);

        self::assertSame(200, $response->getStatusCode());
        self::assertFalse($this->json($response)['is_active']);
    }

    public function testAGroupCannotBeReactivatedUnderAnInactiveArea(): void
    {
        $area = $this->createArea('Temporal');
        $group = $this->createGroup($area, 'Pasajero');
        $this->api('POST', '/product-groups/' . $group . '/deactivate', $this->adminToken);
        $this->api('POST', '/areas/' . $area . '/deactivate', $this->adminToken);

        $blocked = $this->api('POST', '/product-groups/' . $group . '/reactivate', $this->adminToken);
        self::assertSame(['area_id' => 'parent_inactive'], $this->errorCodes($blocked));

        $this->api('POST', '/areas/' . $area . '/reactivate', $this->adminToken);
        $allowed = $this->api('POST', '/product-groups/' . $group . '/reactivate', $this->adminToken);
        self::assertTrue($this->json($allowed)['is_active']);
    }

    public function testAGroupMovesToAnotherActiveAreaAndKeepsAnInactiveOne(): void
    {
        $from = $this->createArea('Origen');
        $to = $this->areaId('Equipo');
        $group = $this->createGroup($from, 'Móvil');

        $moved = $this->api('PATCH', '/product-groups/' . $group, $this->adminToken, [
            'version' => 1,
            'name' => 'Móvil',
            'area_id' => $to,
        ]);
        self::assertSame(200, $moved->getStatusCode());
        self::assertSame($to, $this->valueAt($this->json($moved), 'area', 'id'));
        $audit = $this->auditEntries('product_groups', $group);
        self::assertSame($from, $this->valueAt($audit[0], 'after', 'area_id'));

        // Moving to an inactive area is refused; staying under one that was deactivated since is allowed.
        $retired = $this->createArea('Retirada', active: false);
        $refused = $this->api('PATCH', '/product-groups/' . $group, $this->adminToken, [
            'version' => 2,
            'name' => 'Móvil',
            'area_id' => $retired,
        ]);
        self::assertSame(['area_id' => 'not_found'], $this->errorCodes($refused));

        $this->connection->executeStatement(
            "UPDATE areas SET deleted_at = NOW(3) WHERE name = 'Equipo'",
        );
        $renamed = $this->api('PATCH', '/product-groups/' . $group, $this->adminToken, [
            'version' => 2,
            'name' => 'Móvil 2',
            'area_id' => $to,
        ]);
        self::assertSame(200, $renamed->getStatusCode());
    }

    public function testEachStructureListHasItsOwnPermissions(): void
    {
        $groups = $this->tokenWith('product_groups', 'view', 'create', 'edit', 'deactivate');

        self::assertSame(200, $this->api('GET', '/product-groups', $groups)->getStatusCode());
        // Seeing groups does not open areas: the screen's selector needs `areas.view` until /options exist.
        self::assertSame(403, $this->api('GET', '/areas', $groups)->getStatusCode());
        self::assertSame(403, $this->api('GET', '/brands', $groups)->getStatusCode());
    }

    private function areaId(string $name): string
    {
        return $this->idOf('areas', $name);
    }

    private function categoryId(string $name): string
    {
        return $this->idOf('unit_categories', $name);
    }

    private function idOf(string $table, string $name): string
    {
        $id = $this->connection->fetchOne(
            'SELECT LOWER(HEX(id)) FROM ' . $table . ' WHERE name = :name',
            ['name' => $name],
        );
        self::assertIsString($id);

        return Uuid::fromHex($id);
    }

    private function createArea(string $name, bool $active = true): string
    {
        $response = $this->api('POST', '/areas', $this->adminToken, ['name' => $name]);
        self::assertSame(201, $response->getStatusCode());
        $id = $this->text($this->json($response), 'id');
        if (!$active) {
            $this->api('POST', '/areas/' . $id . '/deactivate', $this->adminToken);
        }

        return $id;
    }

    private function createGroup(string $areaId, string $name, bool $active = true): string
    {
        $response = $this->api('POST', '/product-groups', $this->adminToken, ['name' => $name, 'area_id' => $areaId]);
        self::assertSame(201, $response->getStatusCode());
        $id = $this->text($this->json($response), 'id');
        if (!$active) {
            $this->api('POST', '/product-groups/' . $id . '/deactivate', $this->adminToken);
        }

        return $id;
    }
}
