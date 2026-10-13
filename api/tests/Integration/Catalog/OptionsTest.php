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

    public function testAnyInternalUserReadsTheOptionsWithoutAnyPermissionOnTheSection(): void
    {
        // A role with nothing on catalog sections, and a user with no role at all.
        $unrelated = $this->tokenWith('contacts', 'view');
        $roleless = $this->tokenFor($this->createUser('roleless@example.com')['id']);

        foreach ([$unrelated, $roleless] as $token) {
            foreach (['/areas/options', '/unit-categories/options'] as $path) {
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
    }

    public function testNeedsASession(): void
    {
        self::assertSame(401, $this->api('GET', '/areas/options')->getStatusCode());
        self::assertSame(401, $this->api('GET', '/unit-categories/options')->getStatusCode());
    }

    public function testAListNobodyConsumesYetHasNoOptionsRoute(): void
    {
        // It is read as the id of a segment and no such segment exists.
        self::assertSame(404, $this->api('GET', '/segments/options', $this->adminToken)->getStatusCode());
    }
}
