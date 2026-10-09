<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Psr\Http\Message\ResponseInterface;
use Soltec\Kernel\Mail\MailException;
use Soltec\Kernel\Uuid;

final class UsersTest extends AccessTestCase
{
    private string $adminToken;
    /** @var array{id: string, email: string} */
    private array $admin;
    private string $managerRole;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->createAdmin();
        $this->adminToken = $this->tokenFor($this->admin['id']);
        // A "user manager" is not an administrator: it can administer users but never the admin role.
        $this->managerRole = $this->createRole(
            'User manager',
            ['users' => ['view', 'create', 'edit', 'deactivate']],
            ['users' => 'all'],
        );
    }

    // --- create ---------------------------------------------------------------------------------------------

    public function testCreatesAnInternalUserWithoutPasswordAndEmailsTheInvitation(): void
    {
        $response = $this->createUserVia($this->adminToken, ['email' => 'New.Person@Example.com']);

        self::assertSame(201, $response->getStatusCode());
        $user = $this->json($response);
        self::assertSame('new.person@example.com', $user['email']);
        self::assertSame('internal', $user['type']);
        self::assertTrue($user['is_active']);
        self::assertFalse($user['must_change_password']);
        self::assertTrue($user['invitation_pending']);
        self::assertTrue($user['invitation_sent']);
        self::assertSame(1, $user['version']);
        self::assertSame([$this->managerRole], $this->columnAt($user, 'id', 'roles'));
        self::assertStringNotContainsString('password_hash', (string) $response->getBody());
        self::assertStringNotContainsString('#token', (string) $response->getBody());
        self::assertCount(1, $this->mail->sent);
        self::assertSame('new.person@example.com', $this->mail->sent[0]->to);
        self::assertStringContainsString(
            'https://app.example.test/aceptar-invitacion#token=',
            $this->mail->sent[0]->body,
        );
    }

    public function testTheNewUserCannotSignInUntilTheInvitationIsAccepted(): void
    {
        $this->createUserVia($this->adminToken, ['email' => 'new@example.com']);

        self::assertSame(401, $this->login('new@example.com', 'any password at all')->getStatusCode());
    }

    public function testTheUserIsCreatedEvenWhenTheEmailCannotBeSent(): void
    {
        $this->mail->failWith(new MailException('SMTP down'));

        $response = $this->createUserVia($this->adminToken);

        self::assertSame(201, $response->getStatusCode());
        self::assertFalse($this->json($response)['invitation_sent']);
        self::assertSame(1, $this->countRows("SELECT COUNT(*) FROM users WHERE email = 'new@example.com'"));
    }

    public function testValidatesEveryFieldAtOnce(): void
    {
        $response = $this->api('POST', '/users', $this->adminToken, [
            'name' => '',
            'email' => 'not-an-email',
            'role_ids' => [],
        ]);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame(
            ['name' => 'required', 'email' => 'invalid', 'role_ids' => 'required'],
            $this->errorCodes($response),
        );
    }

    public function testAPasswordSentByAnOutdatedClientIsIgnored(): void
    {
        $this->createUserVia($this->adminToken, ['initial_password' => 'temporary password 1']);

        self::assertSame(401, $this->login('new@example.com', 'temporary password 1')->getStatusCode());
    }

    public function testAnEmailAlreadyInUseByAnActiveUserIsAFieldError(): void
    {
        $this->createUser('taken@example.com');

        $response = $this->createUserVia($this->adminToken, ['email' => 'TAKEN@example.com']);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame([['field' => 'email', 'code' => 'taken']], $this->json($response)['errors']);
    }

    public function testADeactivatedUsersEmailCanBeUsedAgain(): void
    {
        $old = $this->createUser('again@example.com');
        $this->api('POST', '/users/' . $old['id'] . '/deactivate', $this->adminToken);

        self::assertSame(
            201,
            $this->createUserVia($this->adminToken, ['email' => 'again@example.com'])->getStatusCode(),
        );
    }

    public function testRoleIdsAreFilteredAgainstExistingActiveInternalRoles(): void
    {
        $inactive = $this->createRole('Retired');
        $this->api('POST', '/roles/' . $inactive . '/deactivate', $this->adminToken);

        foreach ([[Uuid::v7()], [$this->managerRole, Uuid::v7()], [$inactive]] as $ids) {
            $response = $this->createUserVia($this->adminToken, ['role_ids' => $ids]);
            self::assertSame(422, $response->getStatusCode());
            self::assertSame([['field' => 'role_ids', 'code' => 'not_found']], $this->json($response)['errors']);
        }
        self::assertSame(0, $this->countRows("SELECT COUNT(*) FROM users WHERE email LIKE 'new%'"));
    }

    public function testOnlyAnAdministratorCanGiveTheAdminRole(): void
    {
        $manager = $this->createUser('manager@example.com', [$this->managerRole]);
        $managerToken = $this->tokenFor($manager['id']);

        $denied = $this->createUserVia($managerToken, ['role_ids' => [$this->adminRoleId()]]);
        self::assertSame(403, $denied->getStatusCode());
        self::assertSame(0, $this->countRows("SELECT COUNT(*) FROM users WHERE email = 'new@example.com'"));

        $allowed = $this->createUserVia($this->adminToken, ['role_ids' => [$this->adminRoleId()]]);
        self::assertSame(201, $allowed->getStatusCode());
    }

    public function testCreatesAnAuditEntryWithoutPasswords(): void
    {
        $id = $this->text($this->json($this->createUserVia($this->adminToken)), 'id');

        $entries = $this->auditEntries('users', $id);

        self::assertSame(['create', 'invite'], array_column($entries, 'action'));
        $after = $entries[0]['after'];
        self::assertIsArray($after);
        self::assertSame('new@example.com', $after['email']);
        self::assertSame([$this->managerRole], $after['role_ids']);
        self::assertStringNotContainsString('password', (string) json_encode($after));
        self::assertSame($this->admin['id'], $entries[0]['userId']);
        self::assertNull($entries[1]['after']);
    }

    // --- read -----------------------------------------------------------------------------------------------

    public function testListsWithPaginationSearchAndFilters(): void
    {
        $this->createUser('ana@example.com', [$this->managerRole], name: 'Ana Pérez');
        $this->createUser('luis@example.com', name: 'Luis Gómez');
        $gone = $this->createUser('gone@example.com', name: 'Gone Person');
        $this->api('POST', '/users/' . $gone['id'] . '/deactivate', $this->adminToken);

        $all = $this->json($this->api('GET', '/users', $this->adminToken));
        self::assertSame(3, $this->valueAt($all, 'meta', 'total'), 'Inactive users are hidden by default.');

        $page = $this->json($this->api('GET', '/users?per_page=2&page=2', $this->adminToken));
        self::assertCount(1, $this->rowsAt($page, 'data'));
        self::assertSame(['page' => 2, 'per_page' => 2, 'total' => 3], $page['meta']);

        $byText = $this->json($this->api('GET', '/users?q=g%C3%B3mez', $this->adminToken));
        self::assertSame(['luis@example.com'], $this->columnAt($byText, 'email', 'data'));

        $inactive = $this->json($this->api('GET', '/users?status=inactive', $this->adminToken));
        self::assertSame(['gone@example.com'], $this->columnAt($inactive, 'email', 'data'));

        $everyone = $this->json($this->api('GET', '/users?status=all', $this->adminToken));
        self::assertSame(4, $this->valueAt($everyone, 'meta', 'total'));

        $byRole = $this->json($this->api('GET', '/users?role_id=' . $this->managerRole, $this->adminToken));
        self::assertSame(['ana@example.com'], $this->columnAt($byRole, 'email', 'data'));
    }

    public function testASearchTextIsNotAPattern(): void
    {
        $this->createUser('ana@example.com');

        $response = $this->json($this->api('GET', '/users?q=%25', $this->adminToken));

        self::assertSame(0, $this->valueAt($response, 'meta', 'total'));
    }

    public function testRejectsBadListParameters(): void
    {
        foreach (['?page=0', '?per_page=500', '?status=deleted', '?type=robot', '?role_id=nope'] as $query) {
            self::assertSame(422, $this->api('GET', '/users' . $query, $this->adminToken)->getStatusCode(), $query);
        }
    }

    public function testGetsAUserAndAnUnknownIdIsNotFound(): void
    {
        $user = $this->createUser('ana@example.com');

        self::assertSame($user['id'], $this->json($this->api('GET', '/users/' . $user['id'], $this->adminToken))['id']);
        self::assertSame(404, $this->api('GET', '/users/' . Uuid::v7(), $this->adminToken)->getStatusCode());
        self::assertSame(404, $this->api('GET', '/users/not-a-uuid', $this->adminToken)->getStatusCode());
    }

    // --- update ---------------------------------------------------------------------------------------------

    public function testUpdatesOnlyTheFieldsSentAndBumpsTheVersion(): void
    {
        $user = $this->createUser('ana@example.com', name: 'Ana');

        $response = $this->update($user['id'], ['name' => 'Ana María']);

        self::assertSame(200, $response->getStatusCode());
        $body = $this->json($response);
        self::assertSame('Ana María', $body['name']);
        self::assertSame('ana@example.com', $body['email']);
        self::assertSame(2, $body['version']);
    }

    public function testAStaleVersionIsAConflictAndChangesNothing(): void
    {
        $user = $this->createUser('ana@example.com', name: 'Ana');
        $this->update($user['id'], ['name' => 'First']);

        $response = $this->update($user['id'], ['name' => 'Second']);

        self::assertSame(409, $response->getStatusCode());
        self::assertSame('conflict', $this->json($response)['code']);
        self::assertSame(
            'First',
            $this->connection->fetchOne('SELECT name FROM users WHERE email = :e', ['e' => 'ana@example.com']),
        );
    }

    public function testChangingTheEmailToOneInUseIsAFieldError(): void
    {
        $user = $this->createUser('ana@example.com');
        $this->createUser('luis@example.com');

        $response = $this->update($user['id'], ['email' => 'luis@example.com']);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame([['field' => 'email', 'code' => 'taken']], $this->json($response)['errors']);
    }

    public function testKeepingTheSameEmailIsNotAConflictWithItself(): void
    {
        $user = $this->createUser('ana@example.com');

        self::assertSame(
            200,
            $this->update($user['id'], ['email' => 'ANA@example.com', 'name' => 'Ana B'])->getStatusCode(),
        );
    }

    public function testReplacesTheRolesAndAuditsBeforeAndAfter(): void
    {
        $user = $this->createUser('ana@example.com');

        $response = $this->update($user['id'], ['role_ids' => [$this->managerRole]]);

        self::assertSame([$this->managerRole], $this->columnAt($this->json($response), 'id', 'roles'));
        $entries = $this->auditEntries('users', $user['id']);
        self::assertCount(1, $entries);
        self::assertSame('update', $entries[0]['action']);
        self::assertSame(['role_ids' => []], $entries[0]['before']);
        self::assertSame(['role_ids' => [$this->managerRole]], $entries[0]['after']);
    }

    public function testAnUpdateThatChangesNothingStillRecordsAnEmptyDiff(): void
    {
        $user = $this->createUser('ana@example.com', name: 'Ana');

        $this->update($user['id'], ['name' => 'Ana']);

        $entries = $this->auditEntries('users', $user['id']);
        self::assertSame([], $entries[0]['before']);
    }

    public function testRejectsUnknownRoleIdsOnUpdate(): void
    {
        $user = $this->createUser('ana@example.com');

        $response = $this->update($user['id'], ['role_ids' => [Uuid::v7()]]);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame(1, $this->countRows('SELECT version FROM users WHERE email = :e', ['e' => 'ana@example.com']));
    }

    public function testAVersionIsRequired(): void
    {
        $user = $this->createUser('ana@example.com');

        $response = $this->api('PATCH', '/users/' . $user['id'], $this->adminToken, ['name' => 'x']);

        self::assertSame([['field' => 'version', 'code' => 'required']], $this->json($response)['errors']);
    }

    // --- escalation and lock-out protections ------------------------------------------------------------------

    public function testOnlyAnAdministratorCanGiveOrTakeTheAdminRole(): void
    {
        $manager = $this->createUser('manager@example.com', [$this->managerRole]);
        $managerToken = $this->tokenFor($manager['id']);
        $target = $this->createUser('target@example.com');
        $otherAdmin = $this->createAdmin('second@example.com');

        $give = $this->api('PATCH', '/users/' . $target['id'], $managerToken, [
            'version' => 1, 'role_ids' => [$this->adminRoleId()],
        ]);
        self::assertSame(403, $give->getStatusCode());

        $take = $this->api('PATCH', '/users/' . $otherAdmin['id'], $managerToken, [
            'version' => 1, 'role_ids' => [$this->managerRole],
        ]);
        self::assertSame(403, $take->getStatusCode());

        self::assertSame(200, $this->update($target['id'], ['role_ids' => [$this->adminRoleId()]])->getStatusCode());
        self::assertSame(
            200,
            $this->update($otherAdmin['id'], ['role_ids' => [$this->managerRole]], 1)->getStatusCode(),
        );
    }

    public function testANonAdministratorCannotEditOrDeactivateOrReactivateAnAdministrator(): void
    {
        $manager = $this->createUser('manager@example.com', [$this->managerRole]);
        $managerToken = $this->tokenFor($manager['id']);
        $other = $this->createAdmin('second@example.com');

        self::assertSame(
            403,
            $this->api('PATCH', '/users/' . $other['id'], $managerToken, [
                'version' => 1,
                'name' => 'x',
            ])->getStatusCode(),
        );
        self::assertSame(
            403,
            $this->api('POST', '/users/' . $other['id'] . '/deactivate', $managerToken)->getStatusCode(),
        );
        $this->api('POST', '/users/' . $other['id'] . '/deactivate', $this->adminToken);
        self::assertSame(
            403,
            $this->api('POST', '/users/' . $other['id'] . '/reactivate', $managerToken)->getStatusCode(),
        );
    }

    public function testANonAdministratorCannotChangeTheirOwnRoles(): void
    {
        $managerRoleTwo = $this->createRole('Another');
        $manager = $this->createUser('manager@example.com', [$this->managerRole]);

        $response = $this->api('PATCH', '/users/' . $manager['id'], $this->tokenFor($manager['id']), [
            'version' => 1, 'role_ids' => [$this->managerRole, $managerRoleTwo],
        ]);

        self::assertSame(403, $response->getStatusCode());
        $kept = 'SELECT COUNT(*) FROM user_roles WHERE user_id = UNHEX(:id) AND role_id = UNHEX(:role)';
        self::assertSame(1, $this->countRows($kept, [
            'id' => Uuid::toHex($manager['id']), 'role' => Uuid::toHex($this->managerRole),
        ]));
    }

    public function testANonAdministratorCanStillEditTheirOwnName(): void
    {
        $manager = $this->createUser('manager@example.com', [$this->managerRole]);

        $response = $this->api('PATCH', '/users/' . $manager['id'], $this->tokenFor($manager['id']), [
            'version' => 1, 'name' => 'New name', 'role_ids' => [$this->managerRole],
        ]);

        self::assertSame(200, $response->getStatusCode());
    }

    public function testTheOnlyAdministratorCannotChangeTheirOwnRoles(): void
    {
        $response = $this->update($this->admin['id'], ['role_ids' => [$this->managerRole]]);

        self::assertSame(409, $response->getStatusCode());
        self::assertSame('last_admin', $this->json($response)['code']);
        self::assertSame(
            [$this->adminRoleId()],
            $this->columnAt(
                $this->json($this->api('GET', '/users/' . $this->admin['id'], $this->adminToken)),
                'id',
                'roles',
            ),
        );
    }

    public function testTheOnlyAdministratorCannotEvenAddARoleToThemselves(): void
    {
        $response = $this->update($this->admin['id'], ['role_ids' => [$this->adminRoleId(), $this->managerRole]]);

        self::assertSame('last_admin', $this->json($response)['code']);
    }

    public function testAnAdministratorCanStepDownWhenAnotherOneRemains(): void
    {
        $this->createAdmin('second@example.com');

        $response = $this->update($this->admin['id'], ['role_ids' => [$this->managerRole]]);

        self::assertSame(200, $response->getStatusCode());
    }

    public function testTwoAdministratorsCannotLeaveTheSystemWithNone(): void
    {
        $second = $this->createAdmin('second@example.com');
        $secondToken = $this->tokenFor($second['id']);

        $first = $this->update($this->admin['id'], ['role_ids' => [$this->managerRole]]);
        self::assertSame(200, $first->getStatusCode());

        // The first administrator no longer is one, so their token no longer reaches the second.
        $second = $this->api('PATCH', '/users/' . $second['id'], $secondToken, [
            'version' => 1, 'role_ids' => [$this->managerRole],
        ]);
        self::assertSame(409, $second->getStatusCode());
        self::assertSame('last_admin', $this->json($second)['code']);
    }

    public function testNobodyCanDeactivateThemselves(): void
    {
        $this->createAdmin('second@example.com');
        $manager = $this->createUser('manager@example.com', [$this->managerRole]);

        $callers = [[$this->admin['id'], $this->adminToken], [$manager['id'], $this->tokenFor($manager['id'])]];
        foreach ($callers as [$id, $token]) {
            $response = $this->api('POST', '/users/' . $id . '/deactivate', $token);
            self::assertSame(403, $response->getStatusCode());
            self::assertSame('forbidden', $this->json($response)['code']);
        }
        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM users WHERE deleted_at IS NOT NULL'));
    }

    public function testAnAdministratorCanDeactivateAnotherAdministratorWhileOneRemains(): void
    {
        $second = $this->createAdmin('second@example.com');

        self::assertSame(
            200,
            $this->api('POST', '/users/' . $second['id'] . '/deactivate', $this->adminToken)->getStatusCode(),
        );
    }

    // --- deactivate and reactivate ----------------------------------------------------------------------------

    public function testDeactivatingRevokesEverySessionAndIsIdempotent(): void
    {
        $user = $this->createUser('ana@example.com');
        $login = $this->login('ana@example.com');
        $access = $this->text($this->json($login), 'access_token');
        $refresh = $this->refreshCookieValue($login);

        $response = $this->api('POST', '/users/' . $user['id'] . '/deactivate', $this->adminToken);

        self::assertSame(200, $response->getStatusCode());
        self::assertFalse($this->json($response)['is_active']);
        self::assertSame(401, $this->api('GET', '/me', $access)->getStatusCode());
        self::assertSame(
            401,
            $this->call('POST', '/api/v1/auth/refresh', [], null, ['refresh_token' => $refresh])->getStatusCode(),
        );
        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM refresh_tokens WHERE revoked_at IS NULL'));

        $again = $this->api('POST', '/users/' . $user['id'] . '/deactivate', $this->adminToken);
        self::assertSame(200, $again->getStatusCode());
        self::assertSame(1, $this->countRows("SELECT COUNT(*) FROM audit_logs WHERE action = 'deactivate'"));
    }

    public function testNothingIsEverDeletedFromTheDatabase(): void
    {
        $user = $this->createUser('ana@example.com');

        $this->api('POST', '/users/' . $user['id'] . '/deactivate', $this->adminToken);

        self::assertSame(
            1,
            $this->countRows(
                'SELECT COUNT(*) FROM users WHERE email = :e AND deleted_at IS NOT NULL',
                ['e' => 'ana@example.com'],
            ),
        );
    }

    public function testReactivatingRestoresTheAccountButNotTheSessions(): void
    {
        $user = $this->createUser('ana@example.com');
        $login = $this->login('ana@example.com');
        $this->api('POST', '/users/' . $user['id'] . '/deactivate', $this->adminToken);

        $response = $this->api('POST', '/users/' . $user['id'] . '/reactivate', $this->adminToken);

        self::assertSame(200, $response->getStatusCode());
        self::assertTrue($this->json($response)['is_active']);
        self::assertSame(
            401,
            $this->api('GET', '/me', $this->text($this->json($login), 'access_token'))->getStatusCode(),
        );
        self::assertSame(200, $this->login('ana@example.com')->getStatusCode());
    }

    public function testReactivatingClearsTheLock(): void
    {
        $user = $this->createUser('ana@example.com');
        foreach (range(1, 3) as $ignored) {
            $this->login('ana@example.com', 'wrong');
        }
        $this->api('POST', '/users/' . $user['id'] . '/deactivate', $this->adminToken);
        $this->api('POST', '/users/' . $user['id'] . '/reactivate', $this->adminToken);

        self::assertSame(200, $this->login('ana@example.com')->getStatusCode());
    }

    public function testReactivatingFailsWhenTheEmailIsNowUsedByAnActiveUser(): void
    {
        $old = $this->createUser('ana@example.com');
        $this->api('POST', '/users/' . $old['id'] . '/deactivate', $this->adminToken);
        $this->createUser('ana@example.com');

        $response = $this->api('POST', '/users/' . $old['id'] . '/reactivate', $this->adminToken);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame([['field' => 'email', 'code' => 'taken']], $this->json($response)['errors']);
    }

    public function testReactivatingAnActiveUserDoesNothing(): void
    {
        $user = $this->createUser('ana@example.com');

        self::assertSame(
            200,
            $this->api('POST', '/users/' . $user['id'] . '/reactivate', $this->adminToken)->getStatusCode(),
        );
        self::assertSame(0, $this->countRows("SELECT COUNT(*) FROM audit_logs WHERE action = 'reactivate'"));
    }

    public function testDeactivateAndReactivateAreAudited(): void
    {
        $user = $this->createUser('ana@example.com');

        $this->api('POST', '/users/' . $user['id'] . '/deactivate', $this->adminToken);
        $this->api('POST', '/users/' . $user['id'] . '/reactivate', $this->adminToken);

        self::assertSame(
            ['deactivate', 'reactivate'],
            array_column($this->auditEntries('users', $user['id']), 'action'),
        );
    }

    public function testAnUnknownUserIsNotFoundOnEveryAction(): void
    {
        $id = Uuid::v7();

        self::assertSame(
            404,
            $this->api('PATCH', '/users/' . $id, $this->adminToken, ['version' => 1])->getStatusCode(),
        );
        self::assertSame(404, $this->api('POST', '/users/' . $id . '/deactivate', $this->adminToken)->getStatusCode());
        self::assertSame(404, $this->api('POST', '/users/' . $id . '/reactivate', $this->adminToken)->getStatusCode());
    }

    /**
     * @param array<string, mixed> $overrides
     */
    private function createUserVia(string $token, array $overrides = []): ResponseInterface
    {
        return $this->api('POST', '/users', $token, $overrides + [
            'name' => 'New Person',
            'email' => 'new@example.com',
            'role_ids' => [$this->managerRole],
        ]);
    }

    /** @param array<string, mixed> $changes */
    private function update(string $id, array $changes, int $version = 1): ResponseInterface
    {
        return $this->api('PATCH', '/users/' . $id, $this->adminToken, ['version' => $version] + $changes);
    }
}
