<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Persistence\RoleRepository;

/** Which widgets each user's home screen shows, and how a role is assigned them. */
final class DashboardTest extends AccessTestCase
{
    private string $adminToken = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminToken = $this->tokenFor($this->createAdmin()['id']);
    }

    /** @return list<string> */
    private function dashboardOf(string $token): array
    {
        $response = $this->api('GET', '/dashboard', $token);
        self::assertSame(200, $response->getStatusCode());

        return $this->columnAt($this->json($response), 'code', 'data');
    }

    /** A role that shows the widgets, assigned straight in the database. */
    private function roleWithWidgets(string $name, string ...$widgets): string
    {
        $role = $this->createRole($name);
        $this->service(RoleRepository::class)->replaceWidgets($role, array_values($widgets));

        return $role;
    }

    /**
     * @param array<string, mixed> $changes
     * @return array<string, mixed>
     */
    private function roleBody(string $name, array $changes = []): array
    {
        return $changes + ['name' => $name, 'user_type' => 'internal', 'permissions' => [], 'scopes' => []];
    }

    public function testTheAdministratorSeesEveryWidgetAndTheSeedKeepsTheOldHomeScreen(): void
    {
        // The old two keep their places; the widget that registers a prospect goes after them (slice 2.5).
        self::assertSame(
            ['quick_links', 'service_status', 'quick_create_client'],
            $this->dashboardOf($this->adminToken),
        );
    }

    public function testAUserSeesTheWidgetsOfTheirRoleInOrder(): void
    {
        $role = $this->roleWithWidgets('Ops', 'service_status', 'quick_links');
        $user = $this->createUser('ana@example.com', [$role]);

        self::assertSame(['service_status', 'quick_links'], $this->dashboardOf($this->tokenFor($user['id'])));
    }

    public function testSeveralRolesAreMergedWithoutRepeatsAtTheEarliestPosition(): void
    {
        $first = $this->roleWithWidgets('First', 'quick_links');
        $second = $this->roleWithWidgets('Second', 'service_status', 'quick_links');
        $user = $this->createUser('ana@example.com', [$first, $second]);

        // service_status is first for «Second» (position 1), quick_links is first for «First» (position 1):
        // a tie breaks by code so the order never depends on the database.
        self::assertSame(['quick_links', 'service_status'], $this->dashboardOf($this->tokenFor($user['id'])));
    }

    public function testARoleWithoutWidgetsAndAnInactiveRoleShowNothing(): void
    {
        $empty = $this->createRole('Empty');
        $retired = $this->roleWithWidgets('Retired', 'quick_links');
        $this->connection->executeStatement(
            'UPDATE roles SET deleted_at = NOW(3) WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($retired)],
        );
        $user = $this->createUser('ana@example.com', [$empty, $retired]);

        self::assertSame([], $this->dashboardOf($this->tokenFor($user['id'])));
    }

    public function testAUserWithNoRoleGetsAnEmptyListNotAnError(): void
    {
        $user = $this->createUser('ana@example.com');

        self::assertSame([], $this->dashboardOf($this->tokenFor($user['id'])));
    }

    public function testNeedsASessionAndAFullOne(): void
    {
        $user = $this->createUser('ana@example.com');

        self::assertSame(401, $this->api('GET', '/dashboard')->getStatusCode());
        $restricted = $this->tokenFor($user['id'], restricted: true);
        self::assertSame(403, $this->api('GET', '/dashboard', $restricted)->getStatusCode());
    }

    public function testACachedRoleChangeShowsAtTheNextRequest(): void
    {
        $role = $this->roleWithWidgets('Ops', 'quick_links');
        $user = $this->createUser('ana@example.com', [$role]);
        $token = $this->tokenFor($user['id']);
        self::assertSame(['quick_links'], $this->dashboardOf($token));

        $this->api('PATCH', '/roles/' . $role, $this->adminToken, ['version' => 1, 'widgets' => ['service_status']]);

        self::assertSame(['service_status'], $this->dashboardOf($token));
    }

    public function testTheCatalogListsWhatARoleCanBeAssignedAndNeedsRolesView(): void
    {
        $catalog = $this->json($this->api('GET', '/widgets', $this->adminToken));

        self::assertSame(
            ['quick_links', 'quick_create_client', 'service_status'],
            $this->columnAt($catalog, 'code', 'data'),
        );
        self::assertSame(['code', 'description', 'name'], $this->sortedKeys($this->rowsAt($catalog, 'data')[0]));

        $nobody = $this->tokenFor($this->createUser('ana@example.com')['id']);
        self::assertSame(403, $this->api('GET', '/widgets', $nobody)->getStatusCode());
    }

    public function testARoleIsCreatedWithItsWidgetsInTheOrderSent(): void
    {
        $response = $this->api('POST', '/roles', $this->adminToken, $this->roleBody(
            'Ops',
            ['widgets' => ['service_status', 'quick_links']],
        ));

        self::assertSame(201, $response->getStatusCode());
        self::assertSame(['service_status', 'quick_links'], $this->json($response)['widgets']);
        $id = $this->text($this->json($response), 'id');
        $audit = $this->auditEntries('roles', $id);
        self::assertSame(['service_status', 'quick_links'], $audit[0]['after']['widgets'] ?? null);
    }

    public function testARoleCreatedWithoutWidgetsHasNone(): void
    {
        $response = $this->api('POST', '/roles', $this->adminToken, $this->roleBody('Plain'));

        self::assertSame([], $this->json($response)['widgets']);
    }

    public function testUpdatingReplacesTheListAndOmittingItLeavesItAlone(): void
    {
        $role = $this->roleWithWidgets('Ops', 'quick_links', 'service_status');

        $renamed = $this->api('PATCH', '/roles/' . $role, $this->adminToken, ['version' => 1, 'name' => 'Ops 2']);
        self::assertSame(['quick_links', 'service_status'], $this->json($renamed)['widgets']);

        $swapped = $this->api('PATCH', '/roles/' . $role, $this->adminToken, [
            'version' => 2,
            'widgets' => ['service_status'],
        ]);
        self::assertSame(['service_status'], $this->json($swapped)['widgets']);

        $cleared = $this->api('PATCH', '/roles/' . $role, $this->adminToken, ['version' => 3, 'widgets' => []]);
        self::assertSame([], $this->json($cleared)['widgets']);
    }

    public function testTheChangeOfWidgetsIsAudited(): void
    {
        $role = $this->roleWithWidgets('Ops', 'quick_links');

        $this->api('PATCH', '/roles/' . $role, $this->adminToken, [
            'version' => 1,
            'widgets' => ['quick_links', 'service_status'],
        ]);

        $audit = $this->auditEntries('roles', $role);
        self::assertSame(['quick_links'], $audit[0]['before']['widgets'] ?? null);
        self::assertSame(['quick_links', 'service_status'], $audit[0]['after']['widgets'] ?? null);
    }

    public function testRejectsUnknownRepeatedAndMalformedWidgets(): void
    {
        $role = $this->roleWithWidgets('Ops', 'quick_links');

        $cases = [
            'unknown' => [['quick_links', 'nope'], 'not_found'],
            'repeated' => [['quick_links', 'quick_links'], 'invalid'],
            'not a list' => [['a' => 'quick_links'], 'invalid'],
            'not text' => [[1], 'invalid'],
            'a string' => ['quick_links', 'invalid'],
        ];
        foreach ($cases as $label => [$widgets, $code]) {
            $response = $this->api('PATCH', '/roles/' . $role, $this->adminToken, [
                'version' => 1,
                'widgets' => $widgets,
            ]);
            self::assertSame(422, $response->getStatusCode(), $label);
            self::assertSame(['widgets' => $code], $this->errorCodes($response), $label);
        }
        self::assertSame(1, $this->json($this->api('GET', '/roles/' . $role, $this->adminToken))['version']);
    }

    public function testTheAdministratorRoleCannotLoseItsWidgets(): void
    {
        $response = $this->api('PATCH', '/roles/' . $this->adminRoleId(), $this->adminToken, [
            'version' => 1,
            'widgets' => [],
        ]);

        self::assertSame(409, $response->getStatusCode());
        self::assertSame('system_role_immutable', $this->json($response)['code']);
    }

    /**
     * @param array<string, mixed> $row
     * @return list<string>
     */
    private function sortedKeys(array $row): array
    {
        $keys = array_keys($row);
        sort($keys);

        return $keys;
    }
}
