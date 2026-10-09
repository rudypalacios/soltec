<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel\Deploy;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Soltec\Kernel\Deploy\Requirements\IniSize;

final class IniSizeTest extends TestCase
{
    /** @return iterable<string, array{string, int}> */
    public static function sizes(): iterable
    {
        yield 'bytes' => ['2048', 2048];
        yield 'kilobytes' => ['512K', 512 * 1024];
        yield 'megabytes' => ['128M', 128 * 1024 * 1024];
        yield 'gigabytes' => ['2G', 2 * 1024 * 1024 * 1024];
        yield 'lowercase with spaces' => [' 8m ', 8 * 1024 * 1024];
        yield 'unlimited' => ['-1', IniSize::UNLIMITED];
        yield 'garbage counts as zero' => ['lots', 0];
        yield 'empty counts as zero' => ['', 0];
    }

    #[DataProvider('sizes')]
    public function testConvertsPhpIniSizesToBytes(string $value, int $bytes): void
    {
        self::assertSame($bytes, IniSize::toBytes($value));
    }
}
