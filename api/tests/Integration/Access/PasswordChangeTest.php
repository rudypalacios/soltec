<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Soltec\Kernel\Db\Row;

final class PasswordChangeTest extends AccessTestCase
{
    private const NEW_PASSWORD = 'a brand new password 123';

    public function testChangesThePasswordAndTheOldOneStopsWorking(): void
    {
        $user = $this->createUser('ana@example.com');

        $response = $this->change($this->tokenFor($user['id']), self::PASSWORD, self::NEW_PASSWORD);

        self::assertSame(204, $response->getStatusCode());
        self::assertSame(401, $this->login('ana@example.com')->getStatusCode());
        self::assertSame(200, $this->login('ana@example.com', self::NEW_PASSWORD)->getStatusCode());
    }

    public function testClearsTheMustChangeFlagAndRestartsTheExpiryClock(): void
    {
        $user = $this->createUser('ana@example.com', mustChangePassword: true);
        $this->clock->advance('+80 days');

        $this->change($this->tokenFor($user['id'], restricted: true), self::PASSWORD, self::NEW_PASSWORD);

        $row = $this->connection->fetchAssociative('SELECT must_change_password, password_changed_at FROM users');
        self::assertIsArray($row);
        self::assertSame(0, Row::int($row, 'must_change_password'));
        self::assertSame('2026-12-28 12:00:00.000', Row::string($row, 'password_changed_at'));
    }

    public function testAWrongCurrentPasswordIsAFieldError(): void
    {
        $user = $this->createUser('ana@example.com');

        $response = $this->change($this->tokenFor($user['id']), 'not my password', self::NEW_PASSWORD);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame(
            [['field' => 'current_password', 'code' => 'current_password_incorrect']],
            $this->json($response)['errors'],
        );
    }

    public function testEnforcesThePasswordPolicy(): void
    {
        $user = $this->createUser('ana@example.com');
        $token = $this->tokenFor($user['id']);

        $cases = [
            'too short' => ['short', 'too_short'],
            'too long' => [str_repeat('a', 73), 'too_long'],
            'the email' => ['ANA@example.com', 'invalid'],
            'the same password' => [self::PASSWORD, 'invalid'],
        ];
        foreach ($cases as $label => [$password, $code]) {
            $response = $this->change($token, self::PASSWORD, $password);
            self::assertSame(422, $response->getStatusCode(), $label);
            self::assertSame(['new_password' => $code], $this->errorCodes($response), $label);
        }
    }

    public function testSignsOutEveryOtherDeviceButKeepsTheCurrentOne(): void
    {
        $user = $this->createUser('ana@example.com');
        $phone = $this->sessionFor($user['id']);
        $laptop = $this->sessionFor($user['id']);

        $this->change($laptop['token'], self::PASSWORD, self::NEW_PASSWORD);

        self::assertSame(401, $this->api('GET', '/me', $phone['token'])->getStatusCode());
        self::assertSame(200, $this->api('GET', '/me', $laptop['token'])->getStatusCode());
    }

    public function testRequiresASession(): void
    {
        self::assertSame(401, $this->change(null, self::PASSWORD, self::NEW_PASSWORD)->getStatusCode());
    }

    public function testIsAuditedWithoutAnyPassword(): void
    {
        $user = $this->createUser('ana@example.com');

        $this->change($this->tokenFor($user['id']), self::PASSWORD, self::NEW_PASSWORD);

        $entries = $this->auditEntries('users', $user['id']);
        self::assertCount(1, $entries);
        self::assertSame('password_change', $entries[0]['action']);
        self::assertSame($user['id'], $entries[0]['userId']);
        self::assertNull($entries[0]['before']);
        self::assertNull($entries[0]['after']);
    }

    private function change(?string $token, string $current, string $new): \Psr\Http\Message\ResponseInterface
    {
        return $this->api('POST', '/auth/password/change', $token, [
            'current_password' => $current,
            'new_password' => $new,
        ]);
    }
}
