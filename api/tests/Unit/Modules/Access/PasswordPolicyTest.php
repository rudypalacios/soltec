<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Modules\Access;

use PHPUnit\Framework\TestCase;
use Soltec\Modules\Access\Domain\PasswordHasher;
use Soltec\Modules\Access\Domain\PasswordPolicy;

final class PasswordPolicyTest extends TestCase
{
    public function testAcceptsBetweenTwelveAndSeventyTwoBytes(): void
    {
        self::assertNull(PasswordPolicy::violation(str_repeat('a', 12), 'a@x.com'));
        self::assertNull(PasswordPolicy::violation(str_repeat('a', 72), 'a@x.com'));
    }

    public function testRejectsShortAndLongPasswords(): void
    {
        self::assertSame('too_short', PasswordPolicy::violation(str_repeat('a', 11), 'a@x.com'));
        self::assertSame('too_long', PasswordPolicy::violation(str_repeat('a', 73), 'a@x.com'));
    }

    public function testBcryptSeesBytesSoMultibyteCharactersCountDouble(): void
    {
        // 37 characters of 2 bytes are 74 bytes: bcrypt would silently ignore the tail.
        self::assertSame('too_long', PasswordPolicy::violation(str_repeat('ñ', 37), 'a@x.com'));
    }

    public function testRejectsThePasswordThatIsTheEmail(): void
    {
        self::assertSame('invalid', PasswordPolicy::violation('Person@Example.com', 'person@example.com'));
    }

    public function testTheHasherVerifiesAndTreatsAMissingHashAsAFailure(): void
    {
        $hasher = new PasswordHasher();
        $hash = $hasher->hash('a long enough password');

        self::assertTrue($hasher->verify($hash, 'a long enough password'));
        self::assertFalse($hasher->verify($hash, 'another password'));
        self::assertFalse($hasher->verify(null, 'a long enough password'));
        self::assertFalse($hasher->needsRehash($hash));
    }
}
