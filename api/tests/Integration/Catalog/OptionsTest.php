<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Catalog;

use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Persistence\UserRepository;
use Soltec\Tests\Integration\Access\AccessTestCase;

/** ADR-0024: any internal session may choose among the values of another section without access to that section. */
final class OptionsTest extends AccessTestCase
{
    private string $adminToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminToken = $this->tokenFor($this->createAdmin()['id']);
    }

    public function testReturnsOnlyTheIdAndNameOfTheActiveValuesByName(): void
    {
        $this->api('POST', '/areas', $this->adminToken, ['name' => 'Zeta']);
        $retired = $this->json($this->api('POST', '/areas', $this->adminToken, ['name' => 'Retirada']));
        $this->api('POST', '/areas/' . $this->text($retired, 'id') . '/deactivate', $this->adminToken);

        $options = $this->json($this->api('GET', '/areas/options', $this->adminToken));

        self::assertSame(
            ['Aire Acondicionado', 'Cableado', 'Electricidad', 'Equipo', 'Otros', 'Zeta'],
            $this->columnAt($options, 'name', 'data'),
        );
        self::assertSame(['id', 'name'], array_keys($this->rowsAt($options, 'data')[0]));
    }

    public function testTheOptionsOfAListWithAParentCarryTheIdOfTheParent(): void
    {
        $areas = $this->rowsAt($this->json($this->api('GET', '/areas', $this->adminToken)), 'data');
        $area = $this->text($areas[0], 'id');
        $group = $this->json($this->api(
            'POST',
            '/product-groups',
            $this->adminToken,
            ['name' => 'Conectores', 'area_id' => $area],
        ));
        $retired = $this->json($this->api(
            'POST',
            '/product-groups',
            $this->adminToken,
            ['name' => 'Retirado', 'area_id' => $area],
        ));
        $this->api('POST', '/product-groups/' . $this->text($retired, 'id') . '/deactivate', $this->adminToken);

        $groups = $this->json($this->api('GET', '/product-groups/options', $this->adminToken));
        self::assertSame(
            [['id' => $group['id'], 'name' => 'Conectores', 'area_id' => $area]],
            $this->rowsAt($groups, 'data'),
        );

        $units = $this->rowsAt($this->json($this->api('GET', '/units-of-measure/options', $this->adminToken)), 'data');
        self::assertSame(['id', 'name', 'category_id'], array_keys($units[0]));
        $brands = $this->json($this->api('POST', '/brands', $this->adminToken, ['name' => 'Panduit']));
        $brandOptions = $this->rowsAt($this->json($this->api('GET', '/brands/options', $this->adminToken)), 'data');
        self::assertSame([['id' => $brands['id'], 'name' => 'Panduit']], $brandOptions);
    }

    public function testTheMarginLevelOptionsListTheActiveLevelsByMarginWithTheDefault(): void
    {
        $levels = $this->rowsAt($this->json($this->api('GET', '/margin-levels', $this->adminToken)), 'data');
        $this->api('POST', '/margin-levels/' . $this->text($levels[1], 'id') . '/deactivate', $this->adminToken);
        $this->api('POST', '/margin-levels', $this->adminToken, ['name' => 'Margen 20 %', 'rate' => '0.2']);

        $options = $this->rowsAt($this->json($this->api('GET', '/margin-levels/options', $this->adminToken)), 'data');

        self::assertSame(['Margen 20 %', 'Margen 33 %'], array_column($options, 'name'));
        self::assertSame(['id', 'name', 'rate', 'is_default'], array_keys($options[0]));
        self::assertSame([false, true], array_column($options, 'is_default'));
        self::assertSame('0.20000', $options[0]['rate']);
    }

    public function testAnyInternalUserReadsTheOptionsWithoutAnyPermissionOnTheSection(): void
    {
        // A role with nothing on catalog sections, and a user with no role at all.
        $unrelated = $this->tokenWith('contacts', 'view');
        $roleless = $this->tokenFor($this->createUser('roleless@example.com')['id']);

        foreach ([$unrelated, $roleless] as $token) {
            $paths = [
                '/areas/options', '/unit-categories/options', '/contact-types/options', '/suppliers/options',
                '/brands/options', '/product-groups/options', '/units-of-measure/options', '/margin-levels/options',
            ];
            foreach ($paths as $path) {
                self::assertSame(200, $this->api('GET', $path, $token)->getStatusCode(), $path);
            }
            // The section itself keeps its own permissions: the list, the creation and the edition.
            self::assertSame(403, $this->api('GET', '/areas', $token)->getStatusCode());
            self::assertSame(403, $this->api('POST', '/areas', $token, ['name' => 'Nueva'])->getStatusCode());
        }
    }

    public function testAnExternalUserNeverReadsTheOptions(): void
    {
        $id = Uuid::v7();
        $this->service(UserRepository::class)->insert(
            $id,
            'external',
            'Cliente',
            'cliente@example.com',
            null,
            false,
            $this->clock->now(),
        );
        $token = $this->tokenFor($id);

        self::assertSame(403, $this->api('GET', '/areas/options', $token)->getStatusCode());
        self::assertSame(403, $this->api('GET', '/unit-categories/options', $token)->getStatusCode());
        self::assertSame(403, $this->api('GET', '/contact-types/options', $token)->getStatusCode());
        self::assertSame(403, $this->api('GET', '/suppliers/options', $token)->getStatusCode());
        self::assertSame(403, $this->api('GET', '/brands/options', $token)->getStatusCode());
        self::assertSame(403, $this->api('GET', '/margin-levels/options', $token)->getStatusCode());
    }

    public function testNeedsASession(): void
    {
        self::assertSame(401, $this->api('GET', '/areas/options')->getStatusCode());
        self::assertSame(401, $this->api('GET', '/unit-categories/options')->getStatusCode());
        self::assertSame(401, $this->api('GET', '/contact-types/options')->getStatusCode());
        self::assertSame(401, $this->api('GET', '/suppliers/options')->getStatusCode());
        self::assertSame(401, $this->api('GET', '/brands/options')->getStatusCode());
        self::assertSame(401, $this->api('GET', '/margin-levels/options')->getStatusCode());
    }

    public function testAListNobodyConsumesYetHasNoOptionsRoute(): void
    {
        // It is read as the id of a segment and no such segment exists.
        self::assertSame(404, $this->api('GET', '/segments/options', $this->adminToken)->getStatusCode());
    }
}
