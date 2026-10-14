<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Psr\Http\Message\ResponseInterface;
use Soltec\Kernel\Uuid;

final class RolesTest extends AccessTestCase
{
    private string $adminToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminToken = $this->tokenFor($this->createAdmin()['id']);
    }

    public function testCreatesARoleWithItsMatrix(): void
    {
        $response = $this->createRoleVia();

        self::assertSame(201, $response->getStatusCode());
        $role = $this->json($response);
        self::assertSame('Sales', $role['name']);
        self::assertNull($role['code']);
        self::assertFalse($role['is_system']);
        self::assertTrue($role['is_active']);
        self::assertSame('internal', $role['user_type']);
        self::assertSame(['create', 'view'], $this->valueAt($role, 'permissions', 'users'));
        self::assertSame('own', $this->valueAt($role, 'scopes', 'users'));
        self::assertSame(1, $role['version']);
    }

    public function testACreatedRoleWorksForItsHolders(): void
    {
        $role = $this->text($this->json($this->createRoleVia()), 'id');
        $user = $this->createUser('sales@example.com', [$role]);

        $me = $this->json($this->api('GET', '/me', $this->tokenFor($user['id'])));

        self::assertSame(['create', 'view'], $this->valueAt($me, 'permissions', 'users'));
    }

    public function testValidatesTheMatrixAgainstTheCatalogs(): void
    {
        $cases = [
            'unknown resource' => [['permissions' => ['payroll' => ['view']]], 'permissions.payroll', 'not_found'],
            'unknown action' => [['permissions' => ['users' => ['fly']]], 'permissions.users', 'invalid'],
            'repeated action' => [['permissions' => ['users' => ['view', 'view']]], 'permissions.users', 'invalid'],
            'not a list' => [['permissions' => ['users' => 'view']], 'permissions.users', 'invalid'],
            'non-string action' => [['permissions' => ['users' => [['view']]]], 'permissions.users', 'invalid'],
            'unknown scope resource' => [['scopes' => ['payroll' => 'all']], 'scopes.payroll', 'not_found'],
            'client scope' => [['scopes' => ['users' => 'client']], 'scopes.users', 'invalid'],
            'nonsense scope' => [['scopes' => ['users' => 'galaxy']], 'scopes.users', 'invalid'],
            'action without view' => [
                ['permissions' => ['departments' => ['edit']]], 'permissions.departments', 'view_required',
            ],
            'scope of a resource without owner' => [
                ['scopes' => ['departments' => 'all']], 'scopes.departments', 'not_applicable',
            ],
            'external roles' => [['user_type' => 'external'], 'user_type', 'invalid'],
        ];

        foreach ($cases as $label => [$override, $field, $code]) {
            $response = $this->createRoleVia($override);
            self::assertSame(422, $response->getStatusCode(), $label);
            self::assertSame($code, $this->errorCodes($response)[$field] ?? null, $label);
        }
        self::assertSame(0, $this->countRows("SELECT COUNT(*) FROM roles WHERE is_system = 0"));
    }

    public function testAnUpdateHasTheSameRulesAsACreation(): void
    {
        $role = $this->json($this->createRoleVia());
        $path = '/roles/' . $this->text($role, 'id');

        $withoutView = $this->api('PATCH', $path, $this->adminToken, [
            'version' => 1,
            'permissions' => ['departments' => ['create', 'deactivate']],
        ]);
        $ownerless = $this->api('PATCH', $path, $this->adminToken, [
            'version' => 1,
            'scopes' => ['departments' => 'team'],
        ]);

        self::assertSame(422, $withoutView->getStatusCode());
        self::assertSame('view_required', $this->errorCodes($withoutView)['permissions.departments'] ?? null);
        self::assertSame(422, $ownerless->getStatusCode());
        self::assertSame('not_applicable', $this->errorCodes($ownerless)['scopes.departments'] ?? null);
        self::assertSame($role, $this->json($this->api('GET', $path, $this->adminToken)));
    }

    public function testSavingAWholeMatrixDropsAScopeThatNeverAppliedToItsResource(): void
    {
        // Roles saved before the matrix knew which resources have an owner carry a scope on all of them.
        $legacy = $this->createRole('Legacy', ['departments' => ['view'], 'users' => ['view']], [
            'departments' => 'all',
            'users' => 'team',
        ]);

        $saved = $this->json($this->api('PATCH', '/roles/' . $legacy, $this->adminToken, [
            'version' => 1,
            'scopes' => ['users' => 'team'],
        ]));

        self::assertSame(['users' => 'team'], $saved['scopes']);
    }

    public function testRequiresANameAndAUserType(): void
    {
        $response = $this->api(
            'POST',
            '/roles',
            $this->adminToken,
            ['permissions' => (object) [], 'scopes' => (object) []],
        );

        self::assertSame(
            ['name' => 'required', 'user_type' => 'required'],
            $this->errorCodes($response),
        );
    }

    public function testRoleNamesAreUniqueAmongActiveRoles(): void
    {
        $this->createRoleVia();

        $response = $this->createRoleVia(['name' => 'sales']);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame([['field' => 'name', 'code' => 'taken']], $this->json($response)['errors']);
        self::assertSame(422, $this->createRoleVia(['name' => 'Administrador'])->getStatusCode());
    }

    public function testUpdatesDetailsAndReplacesTheWholeMatrix(): void
    {
        $role = $this->json($this->createRoleVia());

        $response = $this->api('PATCH', '/roles/' . $this->text($role, 'id'), $this->adminToken, [
            'version' => 1,
            'name' => 'Sales team',
            'description' => 'Sells things',
            'permissions' => ['audit_logs' => ['view']],
            'scopes' => ['audit_logs' => 'all'],
        ]);

        self::assertSame(200, $response->getStatusCode());
        $updated = $this->json($response);
        self::assertSame('Sales team', $updated['name']);
        self::assertSame('Sells things', $updated['description']);
        self::assertSame(['audit_logs' => ['view']], $updated['permissions']);
        self::assertSame(['audit_logs' => 'all'], $updated['scopes']);
        self::assertSame(2, $updated['version']);
    }

    public function testAnUpdateWithoutAMatrixKeepsTheMatrix(): void
    {
        $role = $this->json($this->createRoleVia());

        $updated = $this->json(
            $this->api('PATCH', '/roles/' . $this->text($role, 'id'), $this->adminToken, [
                'version' => 1,
                'name' => 'Renamed',
            ]),
        );

        self::assertSame($role['permissions'], $updated['permissions']);
        self::assertSame($role['scopes'], $updated['scopes']);
    }

    public function testAStaleVersionIsAConflict(): void
    {
        $role = $this->json($this->createRoleVia());
        $this->api(
            'PATCH',
            '/roles/' . $this->text($role, 'id'),
            $this->adminToken,
            ['version' => 1, 'name' => 'First'],
        );

        $response = $this->api(
            'PATCH',
            '/roles/' . $this->text($role, 'id'),
            $this->adminToken,
            ['version' => 1, 'name' => 'Second'],
        );

        self::assertSame(409, $response->getStatusCode());
        self::assertSame('conflict', $this->json($response)['code']);
    }

    public function testTheAdminRoleIsImmutable(): void
    {
        $admin = $this->adminRoleId();

        $edit = $this->api(
            'PATCH',
            '/roles/' . $admin,
            $this->adminToken,
            ['version' => 1, 'permissions' => (object) []],
        );
        $deactivate = $this->api('POST', '/roles/' . $admin . '/deactivate', $this->adminToken);
        $reactivate = $this->api('POST', '/roles/' . $admin . '/reactivate', $this->adminToken);

        foreach ([$edit, $deactivate, $reactivate] as $response) {
            self::assertSame(409, $response->getStatusCode());
            self::assertSame('system_role_immutable', $this->json($response)['code']);
        }
        $role = $this->json($this->api('GET', '/roles/' . $admin, $this->adminToken));
        self::assertTrue($role['is_system']);
        self::assertSame('admin', $role['code']);
        self::assertSame(['create', 'deactivate', 'edit', 'view'], $this->valueAt($role, 'permissions', 'users'));
        self::assertSame('all', $this->valueAt($role, 'scopes', 'roles'));
    }

    public function testARoleStillHeldByActiveUsersCannotBeDeactivated(): void
    {
        $role = $this->text($this->json($this->createRoleVia()), 'id');
        $user = $this->createUser('sales@example.com', [$role]);

        $blocked = $this->api('POST', '/roles/' . $role . '/deactivate', $this->adminToken);
        self::assertSame(409, $blocked->getStatusCode());
        self::assertSame('conflict', $this->json($blocked)['code']);

        $this->connection->executeStatement(
            'UPDATE users SET deleted_at = NOW(3) WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($user['id'])],
        );
        self::assertSame(
            200,
            $this->api('POST', '/roles/' . $role . '/deactivate', $this->adminToken)->getStatusCode(),
        );
    }

    public function testDeactivateAndReactivateAreIdempotent(): void
    {
        $role = $this->text($this->json($this->createRoleVia()), 'id');

        $first = $this->json($this->api('POST', '/roles/' . $role . '/deactivate', $this->adminToken));
        $again = $this->json($this->api('POST', '/roles/' . $role . '/deactivate', $this->adminToken));
        self::assertFalse($first['is_active']);
        self::assertSame($first['version'], $again['version']);

        $back = $this->json($this->api('POST', '/roles/' . $role . '/reactivate', $this->adminToken));
        $backAgain = $this->json($this->api('POST', '/roles/' . $role . '/reactivate', $this->adminToken));
        self::assertTrue($back['is_active']);
        self::assertSame($back['version'], $backAgain['version']);
    }

    public function testReactivatingFailsWhenTheNameIsNowTaken(): void
    {
        $old = $this->text($this->json($this->createRoleVia()), 'id');
        $this->api('POST', '/roles/' . $old . '/deactivate', $this->adminToken);
        $this->createRoleVia();

        $response = $this->api('POST', '/roles/' . $old . '/reactivate', $this->adminToken);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame([['field' => 'name', 'code' => 'taken']], $this->json($response)['errors']);
    }

    public function testListsWithFiltersAndPagination(): void
    {
        $this->createRoleVia(['name' => 'Alpha']);
        $this->createRoleVia(['name' => 'Beta']);
        $gone = $this->text($this->json($this->createRoleVia(['name' => 'Gamma'])), 'id');
        $this->api('POST', '/roles/' . $gone . '/deactivate', $this->adminToken);

        $active = $this->json($this->api('GET', '/roles', $this->adminToken));
        self::assertSame(['Administrador', 'Alpha', 'Beta'], $this->columnAt($active, 'name', 'data'));
        self::assertSame(3, $this->valueAt($active, 'meta', 'total'));

        $page = $this->json($this->api('GET', '/roles?per_page=1&page=2', $this->adminToken));
        self::assertSame(['Alpha'], $this->columnAt($page, 'name', 'data'));

        $inactive = $this->json($this->api('GET', '/roles?status=inactive', $this->adminToken));
        self::assertSame(['Gamma'], $this->columnAt($inactive, 'name', 'data'));

        $search = $this->json($this->api('GET', '/roles?q=bet&status=all', $this->adminToken));
        self::assertSame(['Beta'], $this->columnAt($search, 'name', 'data'));

        $external = $this->json($this->api('GET', '/roles?user_type=external', $this->adminToken));
        self::assertSame([], $external['data']);
    }

    public function testListedRolesCarryTheirOwnMatrix(): void
    {
        $this->createRoleVia(['name' => 'Alpha', 'permissions' => ['roles' => ['view']]]);
        $this->createRoleVia(['name' => 'Beta', 'permissions' => ['users' => ['view', 'edit']]]);

        $byName = [];
        foreach ($this->rowsAt($this->json($this->api('GET', '/roles', $this->adminToken)), 'data') as $row) {
            $byName[$this->text($row, 'name')] = $row['permissions'] ?? null;
        }

        self::assertSame(['roles' => ['view']], $byName['Alpha']);
        self::assertSame(['users' => ['edit', 'view']], $byName['Beta']);
    }

    public function testAnUnknownRoleIsNotFound(): void
    {
        $id = Uuid::v7();

        self::assertSame(404, $this->api('GET', '/roles/' . $id, $this->adminToken)->getStatusCode());
        self::assertSame(
            404,
            $this->api('PATCH', '/roles/' . $id, $this->adminToken, ['version' => 1])->getStatusCode(),
        );
        self::assertSame(404, $this->api('POST', '/roles/' . $id . '/deactivate', $this->adminToken)->getStatusCode());
        self::assertSame(404, $this->api('POST', '/roles/' . $id . '/reactivate', $this->adminToken)->getStatusCode());
    }

    public function testEveryChangeIsAudited(): void
    {
        $role = $this->text($this->json($this->createRoleVia()), 'id');
        $this->api(
            'PATCH',
            '/roles/' . $role,
            $this->adminToken,
            ['version' => 1, 'name' => 'Renamed', 'permissions' => ['roles' => ['view']]],
        );
        $this->api('POST', '/roles/' . $role . '/deactivate', $this->adminToken);
        $this->api('POST', '/roles/' . $role . '/reactivate', $this->adminToken);

        $entries = $this->auditEntries('roles', $role);

        self::assertSame(['create', 'update', 'deactivate', 'reactivate'], array_column($entries, 'action'));
        self::assertSame(['name' => 'Sales', 'permissions' => ['users' => ['create', 'view']]], $entries[1]['before']);
        self::assertSame(['name' => 'Renamed', 'permissions' => ['roles' => ['view']]], $entries[1]['after']);
    }

    public function testRoleAdministrationRequiresItsOwnPermissions(): void
    {
        $role = $this->createRole('Roles reader', ['roles' => ['view']], ['roles' => 'all']);
        $token = $this->tokenFor($this->createUser('reader@example.com', [$role])['id']);
        $target = $this->text($this->json($this->createRoleVia()), 'id');

        self::assertSame(200, $this->api('GET', '/roles', $token)->getStatusCode());
        self::assertSame(200, $this->api('GET', '/resources', $token)->getStatusCode());
        self::assertSame(200, $this->api('GET', '/permissions', $token)->getStatusCode());
        self::assertSame(403, $this->api('POST', '/roles', $token, [])->getStatusCode());
        self::assertSame(403, $this->api('PATCH', '/roles/' . $target, $token, ['version' => 1])->getStatusCode());
        self::assertSame(403, $this->api('POST', '/roles/' . $target . '/deactivate', $token)->getStatusCode());
        self::assertSame(403, $this->api('POST', '/roles/' . $target . '/reactivate', $token)->getStatusCode());
    }

    public function testTheCatalogsListWhatTheMatrixIsBuiltFrom(): void
    {
        $resources = $this->json($this->api('GET', '/resources', $this->adminToken));
        $permissions = $this->json($this->api('GET', '/permissions', $this->adminToken));

        self::assertSame(
            [
                'areas', 'audit_logs', 'brands', 'bundles', 'client_statuses', 'company', 'contact_types',
                'contacts',
                'departments', 'financial_settings', 'margin_levels', 'payment_methods', 'product_groups', 'products',
                'roles',
                'security_settings', 'segments', 'sequences', 'suppliers', 'tax_regimes', 'unit_categories',
                'units_of_measure', 'users',
            ],
            $this->columnAt($resources, 'code', 'data'),
        );
        self::assertSame(['create', 'deactivate', 'edit', 'view'], $this->columnAt($permissions, 'code', 'data'));
        self::assertSame(['code', 'name', 'scoped'], array_keys($this->rowsAt($resources, 'data')[0]));
        self::assertSame(['code', 'name'], array_keys($this->rowsAt($permissions, 'data')[0]));
    }

    public function testOnlyTheResourcesWithAnOwnerAreScoped(): void
    {
        $resources = $this->json($this->api('GET', '/resources', $this->adminToken));

        $scoped = array_values(array_map(
            fn (array $row): string => $this->text($row, 'code'),
            array_filter($this->rowsAt($resources, 'data'), static fn (array $row): bool => $row['scoped'] === true),
        ));

        self::assertSame(['audit_logs', 'contacts', 'users'], $scoped);
    }

    /** @param array<string, mixed> $overrides */
    private function createRoleVia(array $overrides = []): ResponseInterface
    {
        return $this->api('POST', '/roles', $this->adminToken, $overrides + [
            'name' => 'Sales',
            'user_type' => 'internal',
            'permissions' => ['users' => ['view', 'create']],
            'scopes' => ['users' => 'own'],
        ]);
    }
}
