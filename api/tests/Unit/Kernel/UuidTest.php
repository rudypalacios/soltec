<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel;

use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use Soltec\Kernel\Uuid;

final class UuidTest extends TestCase
{
    public function testGeneratesValidVersion7Ids(): void
    {
        $id = Uuid::v7();

        self::assertTrue(Uuid::isValid($id));
        self::assertSame('7', $id[14]);
        self::assertContains($id[19], ['8', '9', 'a', 'b']);
    }

    public function testIdsAreTimeOrdered(): void
    {
        $first = Uuid::v7();
        usleep(2000);
        $second = Uuid::v7();

        self::assertLessThan($second, $first);
    }

    public function testHexConversionRoundTrips(): void
    {
        $id = Uuid::v7();

        self::assertSame($id, Uuid::fromHex(Uuid::toHex($id)));
        self::assertSame(32, strlen(Uuid::toHex($id)));
    }

    public function testRejectsAnythingThatIsNotAUuid(): void
    {
        self::assertFalse(Uuid::isValid('not-a-uuid'));
        self::assertFalse(Uuid::isValid("0192f1c2-7d3a-7a11-8f2e-0123456789a'"));

        $this->expectException(InvalidArgumentException::class);
        Uuid::toHex('1; DROP TABLE users');
    }
}
