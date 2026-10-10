<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Soltec\Kernel\Uuid;

final class AuthorizationTest extends AccessTestCase
{
    public function testProtectedRoutesRequireAValidBearerToken(): void
    {
        foreach (['/me', '/users', '/roles', '/resources', '/permissions'] as $path) {
            self::assertSame(401, $this->api('GET', $path)->getStatusCode(), $path);
        }

        foreach (['garbage', 'Bearer', 'Basic abc'] as $header) {
            $response = $this->call('GET', '/api/v1/me', ['Authorization' => $header]);
            self::assertSame(401, $response->getStatusCode(), $header);
            self::assertSame('Bearer', $response->getHeaderLine('WWW-Authenticate'));
        }
        self::assertSame('token_invalid', $this->json($this->api('GET', '/me', 'garbage'))['code']);
    }

    public function testAnExpiredAccessTokenSaysSo(): void
    {
        $token = $this->tokenFor($this->createAdmin()['id']);

        $this->clock->advance('+16 minutes');
        $response = $this->api('GET', '/me', $token);

        self::assertSame(401, $response->getStatusCode());
        self::assertSame('token_expired', $this->json($response)['code']);
    }

    public function testTheHealthRouteStaysPublic(): void
    {
        self::assertSame(200, $this->call('GET', '/api/v1/health')->getStatusCode());
    }

    public function testAnAuthenticatedUserWithoutPermissionsIsForbidden(): void
    {
        $user = $this->createUser('nobody@example.com');
        $token = $this->tokenFor($user['id']);

        self::assertSame(200, $this->api('GET', '/me', $token)->getStatusCode());
        foreach (['/users', '/roles', '/resources', '/permissions'] as $path) {
            $response = $this->api('GET', $path, $token);
            self::assertSame(403, $response->getStatusCode(), $path);
            self::assertSame('forbidden', $this->json($response)['code']);
        }
    }

    public function testEachActionNeedsItsOwnPermission(): void
    {
        $role = $this->createRole('Reader', ['users' => ['view']], ['users' => 'all']);
        $user = $this->createUser('reader@example.com', [$role]);
        $token = $this->tokenFor($user['id']);

        self::assertSame(200, $this->api('GET', '/users', $token)->getStatusCode());
        self::assertSame(403, $this->api('POST', '/users', $token, [])->getStatusCode());
        self::assertSame(403, $this->api('PATCH', '/users/' . $user['id'], $token, ['version' => 1])->getStatusCode());
        self::assertSame(403, $this->api('POST', '/users/' . $user['id'] . '/deactivate', $token)->getStatusCode());
        self::assertSame(403, $this->api('GET', '/roles', $token)->getStatusCode());
    }

    public function testThePermissionCheckRunsBeforeTheBodyIsValidated(): void
    {
        $user = $this->createUser('nobody@example.com');

        $response = $this->api('POST', '/users', $this->tokenFor($user['id']), ['nonsense' => true]);

        self::assertSame(403, $response->getStatusCode());
    }

    public function testARoleChangeAppliesAtTheNextRequestWithTheSameToken(): void
    {
        $role = $this->createRole('Reader', ['users' => ['view']], ['users' => 'all']);
        $user = $this->createUser('reader@example.com', [$role]);
        $token = $this->tokenFor($user['id']);
        self::assertSame(200, $this->api('GET', '/users', $token)->getStatusCode());

        $admin = $this->tokenFor($this->createAdmin()['id']);
        $update = $this->api('PATCH', '/roles/' . $role, $admin, ['version' => 1, 'permissions' => (object) []]);
        self::assertSame(200, $update->getStatusCode());

        self::assertSame(403, $this->api('GET', '/users', $token)->getStatusCode());
    }

    public function testDeactivatingAUserKillsTheirAccessTokenImmediately(): void
    {
        $user = $this->createUser('gone@example.com');
        $token = $this->tokenFor($user['id']);
        self::assertSame(200, $this->api('GET', '/me', $token)->getStatusCode());

        $this->connection->executeStatement(
            'UPDATE users SET deleted_at = NOW(3) WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($user['id'])],
        );

        self::assertSame(401, $this->api('GET', '/me', $token)->getStatusCode());
    }

    public function testATokenForAnotherUsersDeviceIsRejected(): void
    {
        $first = $this->createUser('a@example.com');
        $second = $this->createUser('b@example.com');
        $device = $this->sessionFor($first['id'])['deviceId'];
        $forged = $this->service(\Soltec\Kernel\Auth\JwtService::class)->issue($second['id'], $device, false);

        self::assertSame(401, $this->api('GET', '/me', $forged)->getStatusCode());
    }

    public function testAnInactiveRoleGrantsNothing(): void
    {
        $role = $this->createRole('Reader', ['users' => ['view']], ['users' => 'all']);
        $user = $this->createUser('reader@example.com', [$role]);
        $token = $this->tokenFor($user['id']);
        $this->connection->executeStatement(
            'UPDATE roles SET deleted_at = NOW(3) WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($role)],
        );

        self::assertSame(403, $this->api('GET', '/users', $token)->getStatusCode());
    }

    public function testMePermissionsAreTheUnionOfAllRolesAndTheWidestScopeWins(): void
    {
        $viewer = $this->createRole('Viewer', ['users' => ['view']], ['users' => 'own']);
        $editor = $this->createRole('Editor', ['users' => ['edit'], 'roles' => ['view']], ['users' => 'all']);
        $user = $this->createUser('both@example.com', [$viewer, $editor]);

        $me = $this->json($this->api('GET', '/me', $this->tokenFor($user['id'])));

        self::assertSame(['edit', 'view'], $this->valueAt($me, 'permissions', 'users'));
        self::assertSame(['view'], $this->valueAt($me, 'permissions', 'roles'));
        self::assertSame('all', $this->valueAt($me, 'scopes', 'users'));
        self::assertCount(2, $this->rowsAt($me, 'roles'));
    }

    public function testMeOfAUserWithNoRolesHasEmptyObjectsNotLists(): void
    {
        $user = $this->createUser('nobody@example.com');

        $raw = (string) $this->api('GET', '/me', $this->tokenFor($user['id']))->getBody();

        self::assertStringContainsString('"permissions":{}', $raw);
        self::assertStringContainsString('"scopes":{}', $raw);
    }

    public function testAnOwnScopeSeesOnlyTheirOwnUserRecord(): void
    {
        $role = $this->createRole('Self only', ['users' => ['view', 'edit', 'deactivate']], ['users' => 'own']);
        $me = $this->createUser('me@example.com', [$role]);
        $other = $this->createUser('other@example.com');
        $token = $this->tokenFor($me['id']);

        $list = $this->json($this->api('GET', '/users', $token));
        self::assertSame([$me['id']], $this->columnAt($list, 'id', 'data'));
        self::assertSame(1, $this->valueAt($list, 'meta', 'total'));

        self::assertSame(200, $this->api('GET', '/users/' . $me['id'], $token)->getStatusCode());
        // Out of scope answers 404, not 403: it must not reveal that the record exists.
        foreach (['GET' => null, 'PATCH' => ['version' => 1, 'name' => 'x'], 'POST' => null] as $method => $body) {
            $path = '/users/' . $other['id'] . ($method === 'POST' ? '/deactivate' : '');
            self::assertSame(404, $this->api($method, $path, $token, $body)->getStatusCode(), $method);
        }
    }

    public function testAnAllScopeSeesEveryone(): void
    {
        $role = $this->createRole('Everyone', ['users' => ['view']], ['users' => 'all']);
        $me = $this->createUser('me@example.com', [$role]);
        $this->createUser('other@example.com');

        $list = $this->json($this->api('GET', '/users', $this->tokenFor($me['id'])));

        self::assertSame(2, $this->valueAt($list, 'meta', 'total'));
    }

    public function testAScopeThatIsNotImplementedYetOpensNothing(): void
    {
        // `client` arrives with the client portal; stored by hand, it must not open anything before then.
        $role = $this->createRole('Portal', ['users' => ['view']], []);
        $this->connection->executeStatement(
            "INSERT INTO role_scopes (role_id, resource_code, scope) VALUES (UNHEX(:id), 'users', 'client')",
            ['id' => Uuid::toHex($role)],
        );
        $user = $this->createUser('portal@example.com', [$role]);
        $this->createUser('other@example.com');

        $list = $this->json($this->api('GET', '/users', $this->tokenFor($user['id'])));

        self::assertSame(0, $this->valueAt($list, 'meta', 'total'));
    }

    public function testEveryContractedV1RouteDeniesAnAnonymousCaller(): void
    {
        $app = $this->app;
        $anonymousAllowed = [
            'GET /v1/health',
            'GET /v1/branding',
            'GET /v1/branding/logo',
            'POST /v1/auth/login',
            'POST /v1/auth/refresh',
            'POST /v1/auth/invitations/accept',
            'POST /v1/auth/password/forgot',
            'POST /v1/auth/password/reset',
        ];
        $unprotected = [];
        foreach ($app->getRouteCollector()->getRoutes() as $route) {
            if (!str_starts_with($route->getPattern(), '/v1/')) {
                continue;
            }
            foreach ($route->getMethods() as $method) {
                if (in_array($method . ' ' . $route->getPattern(), $anonymousAllowed, true)) {
                    continue;
                }
                $path = str_replace(['{userId}', '{roleId}'], Uuid::v7(), $route->getPattern());
                $status = $this->call($method, '/api' . $path)->getStatusCode();
                if ($status !== 401) {
                    $unprotected[] = sprintf('%s %s answered %d', $method, $route->getPattern(), $status);
                }
            }
        }

        self::assertSame([], $unprotected);
    }
}
