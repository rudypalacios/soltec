<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Soltec\Modules\Access\Persistence\AccountTokenRepository;

/** The conditional UPDATE is what makes a link single-use when two requests race: it is tested on its own. */
final class AccountTokenRepositoryTest extends AccessTestCase
{
    public function testAnUnusedTokenIsConsumedExactlyOnce(): void
    {
        $tokens = $this->issued();
        $stored = $tokens->find(hash('sha256', 'raw'), AccountTokenRepository::INVITATION);
        self::assertNotNull($stored);

        self::assertTrue($tokens->consume($stored['id'], $this->clock->now()));
        // MySQL counts changed rows: a later moment makes sure the refusal comes from the condition, not from a no-op.
        $this->clock->advance('+1 second');
        self::assertFalse($tokens->consume($stored['id'], $this->clock->now()));
    }

    public function testAnExpiredTokenIsNotConsumed(): void
    {
        $tokens = $this->issued();
        $stored = $tokens->find(hash('sha256', 'raw'), AccountTokenRepository::INVITATION);
        self::assertNotNull($stored);

        $this->clock->advance('+1 hour');

        self::assertFalse($tokens->consume($stored['id'], $this->clock->now()));
    }

    public function testTheTokenIsOnlyFoundForItsOwnPurpose(): void
    {
        $tokens = $this->issued();

        self::assertNull($tokens->find(hash('sha256', 'raw'), AccountTokenRepository::PASSWORD_RESET));
    }

    private function issued(): AccountTokenRepository
    {
        $user = $this->createUser('ana@example.com');
        $tokens = $this->service(AccountTokenRepository::class);
        $now = $this->clock->now();
        $hash = hash('sha256', 'raw');
        $tokens->issue($user['id'], AccountTokenRepository::INVITATION, $hash, $now->modify('+1 hour'), $now);

        return $tokens;
    }
}
