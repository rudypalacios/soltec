<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Organization;

use Soltec\Tests\Integration\Access\AccessTestCase;

/**
 * The `team` scope on a real resource: `users`, whose owner column is the user itself. The team is the user, the
 * people under them through the direct manager (directly or not) and the members of their department.
 */
final class TeamScopeTest extends AccessTestCase
{
    private string $teamRole;

    protected function setUp(): void
    {
        parent::setUp();
        $this->teamRole = $this->createRole('Team lead', ['users' => ['view', 'edit']], ['users' => 'team']);
    }

    public function testATeamLeadReachesTheirTeamAndNobodyElse(): void
    {
        $sales = $this->createDepartment('Ventas');
        $support = $this->createDepartment('Soporte');
        $boss = $this->createUser('boss@example.com');
        $lead = $this->createUser('lead@example.com', [$this->teamRole]);
        $direct = $this->createUser('direct@example.com');
        $indirect = $this->createUser('indirect@example.com');
        $colleague = $this->createUser('colleague@example.com');
        $outsider = $this->createUser('outsider@example.com');
        $this->placeUser($lead['id'], $sales, $boss['id']);
        $this->placeUser($direct['id'], $support, $lead['id']);
        $this->placeUser($indirect['id'], $support, $direct['id']);
        $this->placeUser($colleague['id'], $sales);
        $this->placeUser($outsider['id'], $support);
        $token = $this->tokenFor($lead['id']);

        $list = $this->json($this->api('GET', '/users?per_page=100', $token));

        $expected = [$colleague['id'], $direct['id'], $indirect['id'], $lead['id']];
        sort($expected);
        $ids = $this->columnAt($list, 'id', 'data');
        sort($ids);
        self::assertSame($expected, $ids);
        self::assertSame(4, $this->valueAt($list, 'meta', 'total'));

        self::assertSame(200, $this->api('GET', '/users/' . $indirect['id'], $token)->getStatusCode());
        // Out of the team answers 404, not 403: it must not reveal that the user exists. The manager above too.
        foreach ([$outsider['id'], $boss['id']] as $id) {
            self::assertSame(404, $this->api('GET', '/users/' . $id, $token)->getStatusCode());
            $patch = $this->api('PATCH', '/users/' . $id, $token, ['version' => 1, 'name' => 'x']);
            self::assertSame(404, $patch->getStatusCode());
        }
    }

    public function testADeactivatedManagerInTheMiddleDoesNotCutTheChain(): void
    {
        $lead = $this->createUser('lead@example.com', [$this->teamRole]);
        $middle = $this->createUser('middle@example.com');
        $bottom = $this->createUser('bottom@example.com');
        $this->placeUser($middle['id'], null, $lead['id']);
        $this->placeUser($bottom['id'], null, $middle['id']);
        $this->connection->executeStatement("UPDATE users SET deleted_at = NOW(3) WHERE email = 'middle@example.com'");

        $response = $this->api('GET', '/users/' . $bottom['id'], $this->tokenFor($lead['id']));

        self::assertSame(200, $response->getStatusCode());
    }

    public function testAChangeInTheHierarchyAppliesOnTheNextRequest(): void
    {
        $lead = $this->createUser('lead@example.com', [$this->teamRole]);
        $newcomer = $this->createUser('newcomer@example.com');
        $token = $this->tokenFor($lead['id']);
        self::assertSame(404, $this->api('GET', '/users/' . $newcomer['id'], $token)->getStatusCode());

        $this->placeUser($newcomer['id'], null, $lead['id']);

        self::assertSame(200, $this->api('GET', '/users/' . $newcomer['id'], $token)->getStatusCode());
    }

    public function testTheWidestScopeWinsAcrossRoles(): void
    {
        $everyone = $this->createRole('Everyone', ['users' => ['view']], ['users' => 'all']);
        $lead = $this->createUser('lead@example.com', [$this->teamRole, $everyone]);
        $this->createUser('outsider@example.com');

        $list = $this->json($this->api('GET', '/users', $this->tokenFor($lead['id'])));

        self::assertSame(2, $this->valueAt($list, 'meta', 'total'));
        $me = $this->json($this->api('GET', '/me', $this->tokenFor($lead['id'])));
        self::assertSame('all', $this->valueAt($me, 'scopes', 'users'));
    }

    public function testARoleCanBeSavedWithTheTeamScope(): void
    {
        $admin = $this->tokenFor($this->createAdmin()['id']);

        $response = $this->api('POST', '/roles', $admin, [
            'name' => 'Supervisor',
            'user_type' => 'internal',
            'permissions' => ['users' => ['view']],
            'scopes' => ['users' => 'team'],
        ]);

        self::assertSame(201, $response->getStatusCode());
        self::assertSame('team', $this->valueAt($this->json($response), 'scopes', 'users'));
    }
}
