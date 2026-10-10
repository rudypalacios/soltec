<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Organization;

use Soltec\Tests\Integration\Access\AccessTestCase;

final class DepartmentsTest extends AccessTestCase
{
    private string $adminToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminToken = $this->tokenFor($this->createAdmin()['id']);
    }

    public function testCreatesADepartmentAndAuditsIt(): void
    {
        $response = $this->api('POST', '/departments', $this->adminToken, ['name' => '  Ventas  ']);

        self::assertSame(201, $response->getStatusCode());
        $department = $this->json($response);
        self::assertSame('Ventas', $department['name']);
        self::assertTrue($department['is_active']);
        self::assertSame(0, $department['active_user_count']);
        self::assertSame(1, $department['version']);

        $audit = $this->auditEntries('departments', $this->text($department, 'id'));
        self::assertCount(1, $audit);
        self::assertSame('create', $audit[0]['action']);
        self::assertSame(['name' => 'Ventas', 'is_active' => true], $audit[0]['after']);
    }

    public function testTheNameIsRequiredAndUniqueAmongActiveDepartments(): void
    {
        $this->createDepartment('Ventas');
        $this->createDepartment('Soporte', active: false);

        $empty = $this->api('POST', '/departments', $this->adminToken, ['name' => ' ']);
        self::assertSame(['name' => 'required'], $this->errorCodes($empty));

        $taken = $this->api('POST', '/departments', $this->adminToken, ['name' => 'Ventas']);
        self::assertSame(['name' => 'taken'], $this->errorCodes($taken));

        // A deactivated department frees its name.
        $reused = $this->api('POST', '/departments', $this->adminToken, ['name' => 'Soporte']);
        self::assertSame(201, $reused->getStatusCode());
    }

    public function testListsActiveDepartmentsByNameWithTheirActiveUsers(): void
    {
        $sales = $this->createDepartment('Ventas');
        $this->createDepartment('Administración');
        $this->createDepartment('Bodega', active: false);
        $this->placeUser($this->createUser('one@example.com')['id'], $sales);
        $this->placeUser($this->createUser('two@example.com')['id'], $sales);
        $gone = $this->createUser('gone@example.com')['id'];
        $this->placeUser($gone, $sales);
        $this->connection->executeStatement("UPDATE users SET deleted_at = NOW(3) WHERE email = 'gone@example.com'");

        $list = $this->json($this->api('GET', '/departments', $this->adminToken));
        self::assertSame(['Administración', 'Ventas'], $this->columnAt($list, 'name', 'data'));
        self::assertSame([0, 2], array_column($this->rowsAt($list, 'data'), 'active_user_count'));
        self::assertSame(2, $this->valueAt($list, 'meta', 'total'));

        $all = $this->json($this->api('GET', '/departments?status=all&q=bod', $this->adminToken));
        self::assertSame(['Bodega'], $this->columnAt($all, 'name', 'data'));
    }

    public function testRenamesWithTheVersionItRead(): void
    {
        $id = $this->createDepartment('Ventas');

        $renamed = $this->api('PATCH', '/departments/' . $id, $this->adminToken, [
            'version' => 1,
            'name' => 'Comercial',
        ]);
        self::assertSame(200, $renamed->getStatusCode());
        self::assertSame('Comercial', $this->json($renamed)['name']);
        self::assertSame(2, $this->json($renamed)['version']);

        $stale = $this->api('PATCH', '/departments/' . $id, $this->adminToken, ['version' => 1, 'name' => 'Otra']);
        self::assertSame(409, $stale->getStatusCode());
        self::assertSame('conflict', $this->json($stale)['code']);

        $audit = $this->auditEntries('departments', $id);
        self::assertSame(['name' => 'Ventas'], $audit[0]['before']);
        self::assertSame(['name' => 'Comercial'], $audit[0]['after']);
    }

    public function testADepartmentWithActiveUsersCannotBeDeactivatedAndTheErrorSaysWhy(): void
    {
        $id = $this->createDepartment('Ventas');
        $this->placeUser($this->createUser('one@example.com')['id'], $id);
        $this->placeUser($this->createUser('two@example.com')['id'], $id);

        $response = $this->api('POST', '/departments/' . $id . '/deactivate', $this->adminToken);

        self::assertSame(409, $response->getStatusCode());
        $problem = $this->json($response);
        self::assertSame('department_in_use', $problem['code']);
        self::assertSame(2, $problem['active_user_count']);
        self::assertSame([], $this->auditEntries('departments', $id));
    }

    public function testDeactivatesAnEmptyDepartmentAndReactivatesIt(): void
    {
        $id = $this->createDepartment('Ventas');
        // An inactive user does not keep the department active.
        $this->placeUser($this->createUser('gone@example.com')['id'], $id);
        $this->connection->executeStatement("UPDATE users SET deleted_at = NOW(3) WHERE email = 'gone@example.com'");

        $deactivated = $this->api('POST', '/departments/' . $id . '/deactivate', $this->adminToken);
        self::assertSame(200, $deactivated->getStatusCode());
        self::assertFalse($this->json($deactivated)['is_active']);
        // Idempotent: a second call changes nothing and records nothing.
        $again = $this->api('POST', '/departments/' . $id . '/deactivate', $this->adminToken);
        self::assertSame(200, $again->getStatusCode());

        $reactivated = $this->api('POST', '/departments/' . $id . '/reactivate', $this->adminToken);
        self::assertTrue($this->json($reactivated)['is_active']);
        self::assertSame(['deactivate', 'reactivate'], array_column($this->auditEntries('departments', $id), 'action'));
    }

    public function testReactivatingFailsWhenAnActiveDepartmentTookTheName(): void
    {
        $old = $this->createDepartment('Ventas', active: false);
        $this->createDepartment('Ventas');

        $response = $this->api('POST', '/departments/' . $old . '/reactivate', $this->adminToken);

        self::assertSame(['name' => 'taken'], $this->errorCodes($response));
    }

    public function testUnknownIdsAnswerNotFound(): void
    {
        foreach (['GET' => '', 'POST' => '/deactivate'] as $method => $suffix) {
            $path = '/departments/0192a1b2-0000-7000-8000-000000000000' . $suffix;
            self::assertSame(404, $this->api($method, $path, $this->adminToken)->getStatusCode(), $method);
        }
        self::assertSame(404, $this->api('GET', '/departments/not-a-uuid', $this->adminToken)->getStatusCode());
    }

    public function testEachActionNeedsItsPermission(): void
    {
        $role = $this->createRole('Department reader', ['departments' => ['view']]);
        $token = $this->tokenFor($this->createUser('reader@example.com', [$role])['id']);
        $id = $this->createDepartment('Ventas');

        self::assertSame(200, $this->api('GET', '/departments', $token)->getStatusCode());
        self::assertSame(200, $this->api('GET', '/departments/' . $id, $token)->getStatusCode());
        self::assertSame(403, $this->api('POST', '/departments', $token, ['name' => 'x'])->getStatusCode());
        $patch = $this->api('PATCH', '/departments/' . $id, $token, ['version' => 1, 'name' => 'x']);
        self::assertSame(403, $patch->getStatusCode());
        self::assertSame(403, $this->api('POST', '/departments/' . $id . '/deactivate', $token)->getStatusCode());
        self::assertSame(403, $this->api('POST', '/departments/' . $id . '/reactivate', $token)->getStatusCode());

        $nobody = $this->tokenFor($this->createUser('nobody@example.com')['id']);
        self::assertSame(403, $this->api('GET', '/departments', $nobody)->getStatusCode());
    }
}
