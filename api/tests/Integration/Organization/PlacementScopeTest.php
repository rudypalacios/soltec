<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Organization;

use Psr\Http\Message\ResponseInterface;
use Soltec\Tests\Integration\Access\AccessTestCase;

/**
 * Whoever does not reach every user cannot create or move someone out of their reach (they would lose the record
 * at once), and the manager picker only offers people who can be the manager.
 */
final class PlacementScopeTest extends AccessTestCase
{
    private string $sales;
    private string $support;
    /** @var array{id: string, email: string} */
    private array $lead;
    private string $leadToken;
    private string $role;

    protected function setUp(): void
    {
        parent::setUp();
        $this->sales = $this->createDepartment('Ventas');
        $this->support = $this->createDepartment('Soporte');
        $this->role = $this->createRole('Seller', ['users' => ['view']]);
        $supervisor = $this->createRole(
            'Supervisor',
            ['users' => ['view', 'create', 'edit']],
            ['users' => 'team'],
        );
        $this->lead = $this->createUser('lead@example.com', [$supervisor], name: 'Lead');
        $this->placeUser($this->lead['id'], $this->sales);
        $this->leadToken = $this->tokenFor($this->lead['id']);
    }

    public function testATeamLeadCreatesUsersOnlyInsideTheirTeam(): void
    {
        $outside = $this->createVia($this->leadToken, ['department_id' => $this->support]);
        self::assertSame(
            ['department_id' => 'out_of_scope', 'manager_id' => 'out_of_scope'],
            $this->errorCodes($outside),
        );
        self::assertSame(0, $this->countRows("SELECT COUNT(*) FROM users WHERE email = 'new@example.com'"));

        $underMe = $this->createVia($this->leadToken, [
            'department_id' => $this->support,
            'manager_id' => $this->lead['id'],
        ]);
        self::assertSame(201, $underMe->getStatusCode());

        $inMyDepartment = $this->createVia($this->leadToken, [
            'email' => 'other@example.com',
            'department_id' => $this->sales,
        ]);
        self::assertSame(201, $inMyDepartment->getStatusCode());
    }

    public function testAnOwnScopeCreatesNobody(): void
    {
        $self = $this->createRole('Self', ['users' => ['view', 'create']], ['users' => 'own']);
        $token = $this->tokenFor($this->createUser('self@example.com', [$self])['id']);

        $response = $this->createVia($token, ['department_id' => $this->sales]);

        self::assertSame(403, $response->getStatusCode());
    }

    public function testATeamLeadCannotMoveSomeoneOutOfTheirTeam(): void
    {
        $member = $this->createUser('member@example.com');
        $this->placeUser($member['id'], $this->support, $this->lead['id']);

        $out = $this->update($this->leadToken, $member['id'], ['manager_id' => null]);
        self::assertSame(
            ['department_id' => 'out_of_scope', 'manager_id' => 'out_of_scope'],
            $this->errorCodes($out),
        );

        // Moving inside the team is fine: from under the lead to the lead's department.
        $inside = $this->update($this->leadToken, $member['id'], [
            'department_id' => $this->sales,
            'manager_id' => null,
        ]);
        self::assertSame(200, $inside->getStatusCode());
    }

    public function testTheCallerCanChangeTheirOwnPlacement(): void
    {
        $response = $this->update($this->leadToken, $this->lead['id'], ['department_id' => $this->support]);

        self::assertSame(200, $response->getStatusCode());
    }

    public function testTheManagerPickerLeavesOutTheUserAndEverybodyUnderThem(): void
    {
        $admin = $this->tokenFor($this->createAdmin()['id']);
        $direct = $this->createUser('direct@example.com');
        $indirect = $this->createUser('indirect@example.com');
        $peer = $this->createUser('peer@example.com');
        $this->placeUser($direct['id'], null, $this->lead['id']);
        $this->placeUser($indirect['id'], null, $direct['id']);

        $list = $this->json($this->api(
            'GET',
            '/users?per_page=100&eligible_manager_for=' . $this->lead['id'],
            $admin,
        ));

        $ids = $this->columnAt($list, 'id', 'data');
        self::assertContains($peer['id'], $ids);
        foreach ([$this->lead['id'], $direct['id'], $indirect['id']] as $excluded) {
            self::assertNotContains($excluded, $ids);
        }
        $bad = $this->api('GET', '/users?eligible_manager_for=nope', $admin);
        self::assertSame(['eligible_manager_for' => 'invalid'], $this->errorCodes($bad));
    }

    /** @param array<string, mixed> $fields */
    private function createVia(string $token, array $fields): ResponseInterface
    {
        return $this->api('POST', '/users', $token, $fields + [
            'name' => 'New Person',
            'email' => 'new@example.com',
            'role_ids' => [$this->role],
        ]);
    }

    /** @param array<string, mixed> $changes */
    private function update(string $token, string $id, array $changes): ResponseInterface
    {
        return $this->api('PATCH', '/users/' . $id, $token, ['version' => 1] + $changes);
    }
}
