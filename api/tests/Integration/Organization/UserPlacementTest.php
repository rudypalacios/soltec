<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Organization;

use Psr\Http\Message\ResponseInterface;
use Soltec\Kernel\Uuid;
use Soltec\Tests\Integration\Access\AccessTestCase;

/** The department and the direct manager of a user, through /v1/users. */
final class UserPlacementTest extends AccessTestCase
{
    private string $adminToken;
    private string $role;
    private string $sales;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminToken = $this->tokenFor($this->createAdmin()['id']);
        $this->role = $this->createRole('Seller', ['users' => ['view']]);
        $this->sales = $this->createDepartment('Ventas');
    }

    public function testCreatesAUserInADepartmentUnderAManager(): void
    {
        $boss = $this->createUser('boss@example.com', name: 'Boss');

        $response = $this->api('POST', '/users', $this->adminToken, [
            'name' => 'New Person',
            'email' => 'new@example.com',
            'role_ids' => [$this->role],
            'department_id' => $this->sales,
            'manager_id' => $boss['id'],
        ]);

        self::assertSame(201, $response->getStatusCode());
        $user = $this->json($response);
        self::assertSame(['id' => $this->sales, 'name' => 'Ventas'], $user['department']);
        self::assertSame(['id' => $boss['id'], 'name' => 'Boss'], $user['manager']);
        $after = $this->auditEntries('users', $this->text($user, 'id'))[0]['after'] ?? [];
        self::assertSame($this->sales, $after['department_id'] ?? null);
        self::assertSame($boss['id'], $after['manager_id'] ?? null);
    }

    public function testBothAreOptional(): void
    {
        $response = $this->api('POST', '/users', $this->adminToken, [
            'name' => 'New Person',
            'email' => 'new@example.com',
            'role_ids' => [$this->role],
        ]);

        $user = $this->json($response);
        self::assertNull($user['department']);
        self::assertNull($user['manager']);
    }

    public function testRejectsADepartmentOrManagerThatCannotBeAssigned(): void
    {
        $closed = $this->createDepartment('Cerrado', active: false);
        $gone = $this->createUser('gone@example.com');
        $this->connection->executeStatement("UPDATE users SET deleted_at = NOW(3) WHERE email = 'gone@example.com'");
        $unknown = Uuid::v7();

        $cases = [
            'inactive department' => [['department_id' => $closed], 'department_id', 'not_found'],
            'unknown department' => [['department_id' => $unknown], 'department_id', 'not_found'],
            'malformed department' => [['department_id' => 'nope'], 'department_id', 'invalid'],
            'inactive manager' => [['manager_id' => $gone['id']], 'manager_id', 'not_found'],
            'unknown manager' => [['manager_id' => $unknown], 'manager_id', 'not_found'],
        ];
        foreach ($cases as $label => [$fields, $field, $code]) {
            $response = $this->api('POST', '/users', $this->adminToken, $fields + [
                'name' => 'New Person',
                'email' => 'new@example.com',
                'role_ids' => [$this->role],
            ]);
            self::assertSame(422, $response->getStatusCode(), $label);
            self::assertSame($code, $this->errorCodes($response)[$field] ?? null, $label);
        }
        self::assertSame(0, $this->countRows("SELECT COUNT(*) FROM users WHERE email = 'new@example.com'"));
    }

    public function testMovesAUserAndClearsTheFieldsWithNull(): void
    {
        $boss = $this->createUser('boss@example.com', name: 'Boss');
        $user = $this->createUser('user@example.com');
        $support = $this->createDepartment('Soporte');
        $this->placeUser($user['id'], $this->sales, $boss['id']);

        $moved = $this->update($user['id'], ['department_id' => $support]);
        self::assertSame('Soporte', $this->valueAt($this->json($moved), 'department', 'name'));
        // A field that is not sent stays as it was.
        self::assertSame('Boss', $this->valueAt($this->json($moved), 'manager', 'name'));

        $cleared = $this->json($this->update($user['id'], ['department_id' => null, 'manager_id' => null], 2));
        self::assertNull($cleared['department']);
        self::assertNull($cleared['manager']);

        $audit = $this->auditEntries('users', $user['id']);
        self::assertSame(['department_id' => $this->sales], $audit[0]['before']);
        self::assertSame(['department_id' => $support], $audit[0]['after']);
        // MySQL stores JSON objects with its own key order.
        self::assertEquals(['department_id' => $support, 'manager_id' => $boss['id']], $audit[1]['before']);
    }

    public function testNobodyIsTheirOwnManager(): void
    {
        $user = $this->createUser('user@example.com');

        $response = $this->update($user['id'], ['manager_id' => $user['id']]);

        self::assertSame(['manager_id' => 'invalid'], $this->errorCodes($response));
    }

    public function testRefusesAManagerWhoReportsToTheUserDirectlyOrNot(): void
    {
        $top = $this->createUser('top@example.com');
        $middle = $this->createUser('middle@example.com');
        $bottom = $this->createUser('bottom@example.com');
        $this->placeUser($middle['id'], null, $top['id']);
        $this->placeUser($bottom['id'], null, $middle['id']);

        $direct = $this->update($top['id'], ['manager_id' => $middle['id']]);
        self::assertSame(['manager_id' => 'cycle'], $this->errorCodes($direct));

        $indirect = $this->update($top['id'], ['manager_id' => $bottom['id']]);
        self::assertSame(['manager_id' => 'cycle'], $this->errorCodes($indirect));

        // Moving down the chain the other way is fine: the bottom reports to the top directly.
        self::assertSame(200, $this->update($bottom['id'], ['manager_id' => $top['id']])->getStatusCode());
    }

    public function testKeepsAnUnchangedManagerEvenIfTheyWereDeactivated(): void
    {
        $boss = $this->createUser('boss@example.com', name: 'Boss');
        $user = $this->createUser('user@example.com');
        $this->placeUser($user['id'], null, $boss['id']);
        $this->connection->executeStatement("UPDATE users SET deleted_at = NOW(3) WHERE email = 'boss@example.com'");

        $response = $this->update($user['id'], ['name' => 'Renamed', 'manager_id' => $boss['id']]);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('Boss', $this->valueAt($this->json($response), 'manager', 'name'));
    }

    public function testAnExternalUserHasNoDepartmentNorManager(): void
    {
        $external = Uuid::v7();
        $this->connection->executeStatement(
            "INSERT INTO users (id, type, name, email, created_at, updated_at) "
            . "VALUES (UNHEX(:id), 'external', 'Client', 'client@example.com', NOW(3), NOW(3))",
            ['id' => Uuid::toHex($external)],
        );
        $boss = $this->createUser('boss@example.com');

        $response = $this->update($external, ['department_id' => $this->sales, 'manager_id' => $boss['id']]);

        self::assertSame(['department_id' => 'invalid', 'manager_id' => 'invalid'], $this->errorCodes($response));
    }

    public function testFiltersTheListByDepartment(): void
    {
        $inSales = $this->createUser('sales@example.com');
        $this->createUser('other@example.com');
        $this->placeUser($inSales['id'], $this->sales);

        $list = $this->json($this->api('GET', '/users?department_id=' . $this->sales, $this->adminToken));

        self::assertSame([$inSales['id']], $this->columnAt($list, 'id', 'data'));
        $bad = $this->api('GET', '/users?department_id=nope', $this->adminToken);
        self::assertSame(['department_id' => 'invalid'], $this->errorCodes($bad));
    }

    /** @param array<string, mixed> $changes */
    private function update(string $id, array $changes, int $version = 1): ResponseInterface
    {
        return $this->api('PATCH', '/users/' . $id, $this->adminToken, ['version' => $version] + $changes);
    }
}
