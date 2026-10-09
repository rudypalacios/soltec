<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Soltec\Kernel\Uuid;

final class LoginTest extends AccessTestCase
{
    public function testSignsInAndReturnsTheUserWithTheirPermissions(): void
    {
        $admin = $this->createAdmin();

        $response = $this->login($admin['email']);
        $body = $this->json($response);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('Bearer', $body['token_type']);
        self::assertSame(900, $body['expires_in']);
        self::assertFalse($body['password_change_required']);
        self::assertSame($admin['id'], $this->valueAt($body, 'user', 'id'));
        self::assertContains('view', (array) $this->valueAt($body, 'user', 'permissions', 'users'));
        self::assertSame('all', $this->valueAt($body, 'user', 'scopes', 'roles'));
        self::assertTrue(Uuid::isValid($this->text($body, 'device_id')));
    }

    public function testTheWebGetsTheRefreshTokenOnlyInAnHttpOnlyCookie(): void
    {
        $this->createAdmin();

        $response = $this->login('admin@example.com');

        self::assertArrayNotHasKey('refresh_token', $this->json($response));
        $cookie = $this->setCookie($response);
        self::assertNotNull($cookie);
        self::assertStringContainsString('HttpOnly', $cookie);
        self::assertStringContainsString('Secure', $cookie);
        self::assertStringContainsString('SameSite=Strict', $cookie);
        self::assertStringContainsString('Path=/api/v1/auth', $cookie);
        self::assertStringContainsString('Max-Age=1800', $cookie);
        self::assertSame(64, strlen($this->refreshCookieValue($response)));
    }

    public function testMobileGetsTheRefreshTokenInTheBodyAndNoCookie(): void
    {
        $this->createAdmin();

        $response = $this->login('admin@example.com', body: ['device' => ['platform' => 'android', 'name' => 'Pixel']]);

        self::assertNull($this->setCookie($response));
        self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $this->text($this->json($response), 'refresh_token'));
    }

    public function testTheRefreshTokenIsStoredOnlyAsAHash(): void
    {
        $this->createAdmin();

        $token = $this->refreshCookieValue($this->login('admin@example.com'));

        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM refresh_tokens'));
        self::assertSame(hash('sha256', $token), $this->connection->fetchOne('SELECT token_hash FROM refresh_tokens'));
    }

    public function testASecondLoginFromTheSameDeviceReusesIt(): void
    {
        $this->createAdmin();
        $first = $this->json($this->login('admin@example.com'));

        $second = $this->json($this->login('admin@example.com', body: [
            'device' => ['platform' => 'web', 'id' => $first['device_id']],
        ]));

        self::assertSame($first['device_id'], $second['device_id']);
        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM devices'));
    }

    public function testADeviceIdOfAnotherUserIsNotReused(): void
    {
        $this->createAdmin();
        $this->createUser('other@example.com');
        $theirs = $this->json($this->login('other@example.com'));

        $mine = $this->json($this->login('admin@example.com', body: [
            'device' => ['platform' => 'web', 'id' => $theirs['device_id']],
        ]));

        self::assertNotSame($theirs['device_id'], $mine['device_id']);
    }

    public function testUnknownEmailWrongPasswordAndLockedAccountFailIdentically(): void
    {
        $this->createAdmin();
        $unknown = $this->login('nobody@example.com');
        $wrong = $this->login('admin@example.com', 'a wrong password');
        foreach (range(1, 3) as $ignored) {
            $this->login('admin@example.com', 'a wrong password');
        }
        $locked = $this->login('admin@example.com');

        foreach ([$unknown, $wrong, $locked] as $response) {
            self::assertSame(401, $response->getStatusCode());
            self::assertSame('application/problem+json', $response->getHeaderLine('Content-Type'));
            self::assertSame('invalid_credentials', $this->json($response)['code']);
        }
        self::assertSame((string) $unknown->getBody(), (string) $wrong->getBody());
        self::assertSame((string) $unknown->getBody(), (string) $locked->getBody());
    }

    public function testThirdFailureLocksTheAccountEvenWithTheRightPassword(): void
    {
        $this->createAdmin();

        $this->login('admin@example.com', 'wrong one');
        $this->login('admin@example.com', 'wrong two');
        self::assertSame(200, $this->login('admin@example.com')->getStatusCode(), 'Two failures do not lock.');

        foreach (range(1, 3) as $ignored) {
            $this->login('admin@example.com', 'wrong again');
        }

        self::assertSame(401, $this->login('admin@example.com')->getStatusCode());
    }

    public function testASuccessfulLoginResetsTheFailureCounter(): void
    {
        $this->createAdmin();

        $this->login('admin@example.com', 'wrong one');
        $this->login('admin@example.com', 'wrong two');
        $this->login('admin@example.com');
        $this->login('admin@example.com', 'wrong three');
        $this->login('admin@example.com', 'wrong four');

        self::assertSame(200, $this->login('admin@example.com')->getStatusCode());
    }

    public function testTheLockEndsAfterFifteenMinutesAndTheCounterStartsFromZero(): void
    {
        $this->createAdmin();
        foreach (range(1, 3) as $ignored) {
            $this->login('admin@example.com', 'wrong');
        }

        $this->clock->advance('+14 minutes');
        self::assertSame(401, $this->login('admin@example.com')->getStatusCode(), 'Still locked at 14 minutes.');

        $this->clock->advance('+2 minutes');
        // One failure after the lock expired counts as the first, not as the fourth.
        $this->login('admin@example.com', 'wrong');
        $this->login('admin@example.com', 'wrong');
        self::assertSame(200, $this->login('admin@example.com')->getStatusCode());
    }

    public function testTheAccountLocksAgainAfterThreeMoreFailuresOnceTheLockExpired(): void
    {
        $this->createAdmin();
        foreach (range(1, 3) as $ignored) {
            $this->login('admin@example.com', 'wrong');
        }
        $this->clock->advance('+16 minutes');

        foreach (range(1, 3) as $ignored) {
            $this->login('admin@example.com', 'wrong');
        }

        self::assertSame(401, $this->login('admin@example.com')->getStatusCode());
        $this->clock->advance('+16 minutes');
        self::assertSame(200, $this->login('admin@example.com')->getStatusCode());
    }

    public function testAttemptsMadeWhileLockedDoNotExtendTheLock(): void
    {
        $this->createAdmin();
        foreach (range(1, 3) as $ignored) {
            $this->login('admin@example.com', 'wrong');
        }
        $this->clock->advance('+10 minutes');
        $this->login('admin@example.com', 'wrong');

        $this->clock->advance('+6 minutes');

        self::assertSame(200, $this->login('admin@example.com')->getStatusCode());
    }

    public function testADeactivatedUserCannotSignIn(): void
    {
        $user = $this->createUser('gone@example.com');
        $this->connection->executeStatement(
            'UPDATE users SET deleted_at = NOW(3) WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($user['id'])],
        );

        self::assertSame(401, $this->login('gone@example.com')->getStatusCode());
    }

    public function testEmailIsMatchedIgnoringCase(): void
    {
        $this->createAdmin('admin@example.com');

        self::assertSame(200, $this->login('ADMIN@Example.com')->getStatusCode());
    }

    public function testAnAccountWithATemporaryPasswordGetsARestrictedToken(): void
    {
        $this->createUser('new@example.com', mustChangePassword: true);

        $body = $this->json($this->login('new@example.com'));

        self::assertTrue($body['password_change_required']);
        $me = $this->api('GET', '/me', $this->text($body, 'access_token'));
        self::assertSame(403, $me->getStatusCode());
        self::assertSame('password_change_required', $this->json($me)['code']);
    }

    public function testAnExpiredPasswordGetsARestrictedToken(): void
    {
        $this->createUser(
            'old@example.com',
            passwordChangedAt: $this->clock->now()->modify('-91 days'),
        );
        $this->createUser(
            'fresh@example.com',
            passwordChangedAt: $this->clock->now()->modify('-89 days'),
        );

        self::assertTrue($this->json($this->login('old@example.com'))['password_change_required']);
        self::assertFalse($this->json($this->login('fresh@example.com'))['password_change_required']);
    }

    public function testRejectsAMalformedRequestWithFieldErrors(): void
    {
        $response = $this->api(
            'POST',
            '/auth/login',
            null,
            ['email' => 'not-an-email', 'device' => ['platform' => 'palm']],
        );

        self::assertSame(422, $response->getStatusCode());
        $fields = $this->errorCodes($response);
        self::assertSame(
            ['email' => 'invalid', 'password' => 'required', 'device.platform' => 'invalid'],
            $fields,
        );
    }

    public function testAnEmptyBodyIsRejected(): void
    {
        $response = $this->call('POST', '/api/v1/auth/login', ['Content-Type' => 'application/json'], '');

        self::assertSame(422, $response->getStatusCode());
    }

    public function testAnswers503WhenTheServerHasNoJwtSecret(): void
    {
        $this->createAdmin();
        $app = \Soltec\Kernel\Bootstrap::createApp(
            dirname(__DIR__, 3),
            $this->configWith(['JWT_SECRET' => '']),
            $this->containerDefinitions(),
        );
        $request = (new \Slim\Psr7\Factory\ServerRequestFactory())
            ->createServerRequest('POST', '/api/v1/auth/login')
            ->withHeader('Content-Type', 'application/json');
        $request->getBody()->write((string) json_encode([
            'email' => 'admin@example.com',
            'password' => self::PASSWORD,
            'device' => ['platform' => 'web'],
        ]));

        $response = $app->handle($request);

        self::assertSame(503, $response->getStatusCode());
        self::assertSame('auth_not_configured', $this->json($response)['code']);
    }

    public function testTheLoginDoesNotLeakTheHashOrThePassword(): void
    {
        $this->createAdmin();

        $raw = (string) $this->login('admin@example.com')->getBody();

        self::assertStringNotContainsString('password_hash', $raw);
        self::assertStringNotContainsString('$2y$', $raw);
        self::assertStringNotContainsString(self::PASSWORD, $raw);
    }
}
