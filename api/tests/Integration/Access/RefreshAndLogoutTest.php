<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Psr\Http\Message\ResponseInterface;
use Soltec\Kernel\Uuid;

final class RefreshAndLogoutTest extends AccessTestCase
{
    public function testRotatesTheRefreshTokenAndIssuesANewAccessToken(): void
    {
        $this->createAdmin();
        $first = $this->refreshCookieValue($this->login('admin@example.com'));

        $response = $this->refresh($first);

        self::assertSame(200, $response->getStatusCode());
        $second = $this->refreshCookieValue($response);
        self::assertNotSame($first, $second);
        self::assertNotEmpty($this->json($response)['access_token']);
        self::assertArrayNotHasKey('user', $this->json($response));
        self::assertSame(
            200,
            $this->api('GET', '/me', $this->text($this->json($response), 'access_token'))->getStatusCode(),
        );
    }

    public function testTheNewTokenKeepsWorkingAndEachRefreshExtendsTheWebSession(): void
    {
        $this->createAdmin();
        $token = $this->refreshCookieValue($this->login('admin@example.com'));

        foreach (range(1, 3) as $ignored) {
            $this->clock->advance('+25 minutes');
            $response = $this->refresh($token);
            self::assertSame(200, $response->getStatusCode(), 'Active use must not end the session.');
            $token = $this->refreshCookieValue($response);
        }
    }

    public function testTheWebSessionEndsAfterThirtyMinutesOfInactivity(): void
    {
        $this->createAdmin();
        $token = $this->refreshCookieValue($this->login('admin@example.com'));

        $this->clock->advance('+31 minutes');
        $response = $this->refresh($token);

        self::assertSame(401, $response->getStatusCode());
        self::assertSame('token_expired', $this->json($response)['code']);
    }

    public function testMobileRefreshLastsThirtyDays(): void
    {
        $this->createAdmin();
        $login = $this->login('admin@example.com', body: ['device' => ['platform' => 'ios']]);
        $token = $this->text($this->json($login), 'refresh_token');

        $this->clock->advance('+29 days');
        $response = $this->api('POST', '/auth/refresh', null, ['refresh_token' => $token]);

        self::assertSame(200, $response->getStatusCode());
        self::assertNotSame($token, $this->json($response)['refresh_token']);
        self::assertNull($this->setCookie($response));
    }

    public function testReusingARotatedTokenAfterTheGraceWindowRevokesTheWholeDevice(): void
    {
        $this->createAdmin();
        $stolen = $this->refreshCookieValue($this->login('admin@example.com'));
        $current = $this->refreshCookieValue($this->refresh($stolen));

        $this->clock->advance('+11 seconds');
        $reuse = $this->refresh($stolen);

        self::assertSame(401, $reuse->getStatusCode());
        self::assertSame('token_invalid', $this->json($reuse)['code']);
        self::assertSame(401, $this->refresh($current)->getStatusCode(), 'The legitimate token dies too.');
    }

    public function testTwoTabsRefreshingAtOnceBothSucceedInsideTheGraceWindow(): void
    {
        $this->createAdmin();
        $shared = $this->refreshCookieValue($this->login('admin@example.com'));

        $first = $this->refresh($shared);
        $this->clock->advance('+3 seconds');
        $second = $this->refresh($shared);

        self::assertSame(200, $first->getStatusCode());
        self::assertSame(200, $second->getStatusCode());
        self::assertNull($this->setCookie($second), 'The sibling already delivered the new token through the cookie.');
        $newToken = $this->refreshCookieValue($first);
        self::assertSame(200, $this->refresh($newToken)->getStatusCode());
    }

    public function testTheGraceWindowDoesNotApplyToATokenSentInTheBody(): void
    {
        $this->createAdmin();
        $login = $this->login('admin@example.com', body: ['device' => ['platform' => 'android']]);
        $token = $this->text($this->json($login), 'refresh_token');
        $this->api('POST', '/auth/refresh', null, ['refresh_token' => $token]);

        $reuse = $this->api('POST', '/auth/refresh', null, ['refresh_token' => $token]);

        self::assertSame(401, $reuse->getStatusCode());
    }

    public function testUnknownAndMissingTokensAreInvalid(): void
    {
        self::assertSame('token_invalid', $this->json($this->refresh(str_repeat('a', 64)))['code']);
        self::assertSame(401, $this->api('POST', '/auth/refresh')->getStatusCode());
        self::assertSame(
            401,
            $this->api('POST', '/auth/refresh', null, ['refresh_token' => ['not', 'a string']])->getStatusCode(),
        );
    }

    public function testRefreshingAfterAPasswordChangeLiftsTheRestriction(): void
    {
        $this->createUser('new@example.com', mustChangePassword: true);
        $login = $this->login('new@example.com');
        $restricted = $this->text($this->json($login), 'access_token');
        $cookie = $this->refreshCookieValue($login);

        $change = $this->api('POST', '/auth/password/change', $restricted, [
            'current_password' => self::PASSWORD,
            'new_password' => 'a brand new password 123',
        ]);
        self::assertSame(204, $change->getStatusCode());

        $refreshed = $this->json($this->refresh($cookie));
        self::assertFalse($refreshed['password_change_required']);
        self::assertSame(200, $this->api('GET', '/me', $this->text($refreshed, 'access_token'))->getStatusCode());
    }

    public function testLogoutRevokesTheDeviceAtOnce(): void
    {
        $this->createAdmin();
        $login = $this->login('admin@example.com');
        $access = $this->text($this->json($login), 'access_token');
        $cookie = $this->refreshCookieValue($login);

        $logout = $this->api('POST', '/auth/logout', $access);

        self::assertSame(204, $logout->getStatusCode());
        self::assertStringContainsString('Max-Age=0', (string) $this->setCookie($logout));
        self::assertSame(
            401,
            $this->api('GET', '/me', $access)->getStatusCode(),
            'The access token dies with the device.',
        );
        self::assertSame(401, $this->refresh($cookie)->getStatusCode());
    }

    public function testLogoutOnlyClosesTheCurrentDevice(): void
    {
        $this->createAdmin();
        $phone = $this->json($this->login('admin@example.com'));
        $laptop = $this->json($this->login('admin@example.com'));

        $this->api('POST', '/auth/logout', $this->text($phone, 'access_token'));

        self::assertSame(200, $this->api('GET', '/me', $this->text($laptop, 'access_token'))->getStatusCode());
    }

    public function testALoggedOutRefreshTokenCannotComeBackInsideTheGraceWindow(): void
    {
        $this->createAdmin();
        $login = $this->login('admin@example.com');
        $cookie = $this->refreshCookieValue($login);
        $this->refresh($cookie);
        $this->api('POST', '/auth/logout', $this->text($this->json($login), 'access_token'));

        self::assertSame(401, $this->refresh($cookie)->getStatusCode());
    }

    public function testLogoutRequiresASession(): void
    {
        self::assertSame(401, $this->api('POST', '/auth/logout')->getStatusCode());
    }

    public function testARestrictedSessionCanStillLogOut(): void
    {
        $user = $this->createUser('new@example.com', mustChangePassword: true);

        self::assertSame(
            204,
            $this->api('POST', '/auth/logout', $this->tokenFor($user['id'], restricted: true))->getStatusCode(),
        );
    }

    public function testADeactivatedUserCannotRefresh(): void
    {
        $user = $this->createUser('gone@example.com');
        $cookie = $this->refreshCookieValue($this->login('gone@example.com'));
        $this->connection->executeStatement(
            'UPDATE users SET deleted_at = NOW(3) WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($user['id'])],
        );

        self::assertSame(401, $this->refresh($cookie)->getStatusCode());
    }

    private function refresh(string $token): ResponseInterface
    {
        return $this->call('POST', '/api/v1/auth/refresh', [], null, ['refresh_token' => $token]);
    }
}
