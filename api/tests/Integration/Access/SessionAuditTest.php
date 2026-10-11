<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

/** What the sign-in leaves in the audit log: successes, the moment of a lock and sign-outs, never the failures. */
final class SessionAuditTest extends AccessTestCase
{
    /** @return list<string> */
    private function actions(string $userId): array
    {
        return array_column($this->auditEntries('users', $userId), 'action');
    }

    public function testASuccessfulLoginIsRecordedWithTheUserAndTheDevice(): void
    {
        $ana = $this->createUser('ana@example.com');

        $body = $this->json($this->login('ana@example.com'));

        $entries = $this->auditEntries('users', $ana['id']);
        self::assertSame(['login'], array_column($entries, 'action'));
        self::assertSame($ana['id'], $entries[0]['userId']);
        self::assertSame(
            $body['device_id'],
            $this->deviceOfLastAuditEntry(),
        );
    }

    public function testFailedAttemptsAreNotRecordedOneByOne(): void
    {
        $ana = $this->createUser('ana@example.com');

        $this->login('ana@example.com', 'a wrong password');
        $this->login('ana@example.com', 'another wrong one');
        $this->login('nobody@example.com', 'whatever it is');

        self::assertSame([], $this->actions($ana['id']));
        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM audit_logs'));
    }

    public function testTheMomentAnAccountLocksIsRecordedOnceAndWithoutAnActor(): void
    {
        $ana = $this->createUser('ana@example.com');

        foreach (range(1, 6) as $ignored) {
            $this->login('ana@example.com', 'a wrong password');
        }

        $entries = $this->auditEntries('users', $ana['id']);
        self::assertSame(['lockout'], array_column($entries, 'action'), 'Attempts while locked add nothing.');
        self::assertNull($entries[0]['userId'], 'Nobody signed in: the actor is the anonymous caller.');
        self::assertSame('2026-10-09T12:15:00.000Z', $entries[0]['after']['locked_until'] ?? null);
    }

    public function testALockThatExpiredAndComesBackIsRecordedAgain(): void
    {
        $ana = $this->createUser('ana@example.com');
        foreach (range(1, 3) as $ignored) {
            $this->login('ana@example.com', 'a wrong password');
        }
        $this->clock->advance('+16 minutes');
        foreach (range(1, 3) as $ignored) {
            $this->login('ana@example.com', 'a wrong password');
        }

        self::assertSame(['lockout', 'lockout'], $this->actions($ana['id']));
    }

    public function testSigningOutIsRecorded(): void
    {
        $ana = $this->createUser('ana@example.com');
        $token = $this->text($this->json($this->login('ana@example.com')), 'access_token');

        $this->api('POST', '/auth/logout', $token);

        self::assertSame(['login', 'logout'], $this->actions($ana['id']));
    }

    public function testNothingSecretReachesTheLog(): void
    {
        $this->createUser('ana@example.com');
        $this->login('ana@example.com');
        $this->login('ana@example.com', 'a wrong password');

        $dump = (string) json_encode($this->connection->fetchAllAssociative(
            'SELECT before_data, after_data FROM audit_logs',
        ));
        self::assertStringNotContainsString(self::PASSWORD, $dump);
        self::assertStringNotContainsString('a wrong password', $dump);
    }

    private function deviceOfLastAuditEntry(): string
    {
        $hex = $this->connection->fetchOne('SELECT LOWER(HEX(device_id)) FROM audit_logs ORDER BY occurred_at DESC');
        self::assertIsString($hex);

        return \Soltec\Kernel\Uuid::fromHex($hex);
    }
}
