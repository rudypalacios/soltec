<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Catalog;

use Soltec\Tests\Integration\Access\AccessTestCase;

/** ADR-0024: who fills a form may choose among the values of another section without any access to that section. */
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

    public function testWhoWorksInProductGroupsMayChooseTheAreaWithoutAnyAccessToAreas(): void
    {
        foreach (['view', 'create', 'edit'] as $action) {
            $token = $this->tokenWith('product_groups', ...array_unique(['view', $action]));

            $options = $this->api('GET', '/areas/options', $token);
            self::assertSame(200, $options->getStatusCode(), $action);
            self::assertContains('Cableado', $this->columnAt($this->json($options), 'name', 'data'), $action);

            // The administration of the section still needs its own permission.
            self::assertSame(403, $this->api('GET', '/areas', $token)->getStatusCode(), $action);
            self::assertSame(403, $this->api('POST', '/areas', $token, ['name' => 'Nueva'])->getStatusCode(), $action);
        }
    }

    public function testWithoutViewingProductGroupsTheOptionsStayClosed(): void
    {
        // Nothing but the view opens a section, so an action alone (a role saved without its view) reads nothing.
        $withoutView = $this->tokenWith('product_groups', 'create', 'edit', 'deactivate');

        self::assertSame(403, $this->api('GET', '/areas/options', $withoutView)->getStatusCode());
    }

    public function testWhoManagesAreasReadsTheOptionsToo(): void
    {
        $token = $this->tokenWith('areas', 'view');

        self::assertSame(200, $this->api('GET', '/areas/options', $token)->getStatusCode());
    }

    public function testTheOptionsOfOneListAreNotOpenedByTheConsumersOfAnother(): void
    {
        $units = $this->tokenWith('units_of_measure', 'view');

        self::assertSame(200, $this->api('GET', '/unit-categories/options', $units)->getStatusCode());
        self::assertSame(403, $this->api('GET', '/areas/options', $units)->getStatusCode());
    }

    public function testNeedsASessionAndSomePermission(): void
    {
        $nobody = $this->tokenFor($this->createUser('nobody@example.com')['id']);

        self::assertSame(401, $this->api('GET', '/areas/options')->getStatusCode());
        self::assertSame(403, $this->api('GET', '/areas/options', $nobody)->getStatusCode());
        self::assertSame(403, $this->api('GET', '/unit-categories/options', $nobody)->getStatusCode());
    }

    public function testAListNobodyConsumesYetHasNoOptionsRoute(): void
    {
        // It is read as the id of a segment and no such segment exists.
        self::assertSame(404, $this->api('GET', '/segments/options', $this->adminToken)->getStatusCode());
    }
}
