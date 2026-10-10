<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Soltec\Kernel\Uuid;

final class UnlockTest extends AccessTestCase
{
    private string $adminToken = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminToken = $this->tokenFor($this->createAdmin()['id']);
    }

    private function lock(string $email): void
    {
        foreach (range(1, 3) as $ignored) {
            $this->login($email, 'a wrong password');
        }
    }

    public function testTheUserEntersAgainRightAfterBeingUnlocked(): void
    {
        $ana = $this->createUser('ana@example.com');
        $this->lock('ana@example.com');
        self::assertSame(401, $this->login('ana@example.com')->getStatusCode());
        $listed = $this->json($this->api('GET', '/users/' . $ana['id'], $this->adminToken));
        self::assertNotNull($listed['locked_until']);

        $response = $this->api('POST', '/users/' . $ana['id'] . '/unlock', $this->adminToken);

        self::assertSame(200, $response->getStatusCode());
        self::assertNull($this->json($response)['locked_until']);
        self::assertSame(200, $this->login('ana@example.com')->getStatusCode());
    }

    public function testTheCounterStartsFromZeroAfterAnUnlock(): void
    {
        $ana = $this->createUser('ana@example.com');
        $this->lock('ana@example.com');
        $this->api('POST', '/users/' . $ana['id'] . '/unlock', $this->adminToken);

        $this->login('ana@example.com', 'a wrong password');
        $this->login('ana@example.com', 'a wrong password');

        self::assertSame(200, $this->login('ana@example.com')->getStatusCode(), 'Two failures do not lock again.');
    }

    public function testItClearsACounterThatHasNotLockedYetToo(): void
    {
        $ana = $this->createUser('ana@example.com');
        $this->login('ana@example.com', 'a wrong password');
        $this->login('ana@example.com', 'a wrong password');

        $this->api('POST', '/users/' . $ana['id'] . '/unlock', $this->adminToken);

        $this->login('ana@example.com', 'a wrong password');
        self::assertSame(200, $this->login('ana@example.com')->getStatusCode());
    }

    public function testTheUnlockIsAuditedWithWhatItCleared(): void
    {
        $ana = $this->createUser('ana@example.com');
        $this->lock('ana@example.com');

        $this->api('POST', '/users/' . $ana['id'] . '/unlock', $this->adminToken);

        $entries = array_values(array_filter(
            $this->auditEntries('users', $ana['id']),
            static fn (array $entry): bool => $entry['action'] === 'unlock',
        ));
        self::assertCount(1, $entries);
        self::assertNotNull($entries[0]['userId']);
        self::assertSame(3, $entries[0]['before']['failed_attempts'] ?? null);
        self::assertNotNull($entries[0]['before']['locked_until'] ?? null);
        self::assertEquals(['failed_attempts' => 0, 'locked_until' => null], $entries[0]['after']);
    }

    public function testUnlockingAnAccountThatIsNotCountingFailuresChangesNothing(): void
    {
        $ana = $this->createUser('ana@example.com');

        $first = $this->api('POST', '/users/' . $ana['id'] . '/unlock', $this->adminToken);
        $second = $this->api('POST', '/users/' . $ana['id'] . '/unlock', $this->adminToken);

        self::assertSame(200, $first->getStatusCode());
        self::assertSame(200, $second->getStatusCode());
        self::assertSame(0, $this->countRows("SELECT COUNT(*) FROM audit_logs WHERE action = 'unlock'"));
    }

    public function testNeedsThePermissionToEditUsers(): void
    {
        $ana = $this->createUser('ana@example.com');
        $this->lock('ana@example.com');
        $viewer = $this->tokenWith('users', 'view');

        self::assertSame(403, $this->api('POST', '/users/' . $ana['id'] . '/unlock', $viewer)->getStatusCode());
        self::assertSame(401, $this->api('POST', '/users/' . $ana['id'] . '/unlock')->getStatusCode());
        self::assertSame(401, $this->login('ana@example.com')->getStatusCode(), 'Still locked.');
    }

    public function testSomeoneWhoSeesOnlyTheirOwnRecordCannotUnlockAnotherUser(): void
    {
        $ana = $this->createUser('ana@example.com');
        $this->lock('ana@example.com');
        $role = $this->createRole('Own only', ['users' => ['view', 'edit']], ['users' => 'own']);
        $token = $this->tokenFor($this->createUser('bo@example.com', [$role])['id']);

        $response = $this->api('POST', '/users/' . $ana['id'] . '/unlock', $token);

        self::assertSame(404, $response->getStatusCode(), 'Out of scope looks like it does not exist.');
        self::assertSame(401, $this->login('ana@example.com')->getStatusCode(), 'Still locked.');
    }

    public function testOnlyAnAdministratorMayUnlockAnAdministrator(): void
    {
        $boss = $this->createAdmin('boss@example.com');
        $this->lock('boss@example.com');
        $role = $this->createRole('Users editor', ['users' => ['view', 'edit']], ['users' => 'all']);
        $token = $this->tokenFor($this->createUser('bo@example.com', [$role])['id']);

        self::assertSame(403, $this->api('POST', '/users/' . $boss['id'] . '/unlock', $token)->getStatusCode());
        $byAdmin = $this->api('POST', '/users/' . $boss['id'] . '/unlock', $this->adminToken);
        self::assertSame(200, $byAdmin->getStatusCode());
    }

    public function testAnUnknownOrMalformedIdIsNotFound(): void
    {
        self::assertSame(
            404,
            $this->api('POST', '/users/' . Uuid::v7() . '/unlock', $this->adminToken)->getStatusCode(),
        );
        self::assertSame(404, $this->api('POST', '/users/nope/unlock', $this->adminToken)->getStatusCode());
    }
}
