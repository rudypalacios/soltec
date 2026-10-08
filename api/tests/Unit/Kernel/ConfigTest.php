<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel;

use PHPUnit\Framework\TestCase;
use Soltec\Kernel\Config;
use Soltec\Kernel\ConfigurationException;

final class ConfigTest extends TestCase
{
    public function testOptionalStringIsNullWhenMissingOrEmpty(): void
    {
        $config = new Config(['EMPTY' => '', 'SET' => 'value']);

        self::assertNull($config->optionalString('MISSING'));
        self::assertNull($config->optionalString('EMPTY'));
        self::assertSame('value', $config->optionalString('SET'));
    }

    public function testStringFallsBackToTheDefault(): void
    {
        self::assertSame('fallback', (new Config([]))->string('MISSING', 'fallback'));
    }

    public function testStringFailsLoudlyWhenMissingWithoutDefault(): void
    {
        $this->expectException(ConfigurationException::class);
        $this->expectExceptionMessage('"DB_NAME"');

        (new Config([]))->string('DB_NAME');
    }

    public function testIntParsesNumbersAndRejectsGarbage(): void
    {
        $config = new Config(['PORT' => '3307', 'BAD' => '33x']);

        self::assertSame(3307, $config->int('PORT'));
        self::assertSame(3306, $config->int('MISSING', 3306));

        $this->expectException(ConfigurationException::class);
        $config->int('BAD');
    }

    public function testDebugModeIsOnlyForLocalAndTesting(): void
    {
        self::assertTrue((new Config(['APP_ENV' => 'local']))->isDebug());
        self::assertTrue((new Config(['APP_ENV' => 'testing']))->isDebug());
        self::assertFalse((new Config(['APP_ENV' => 'production']))->isDebug());
        self::assertFalse((new Config([]))->isDebug());
    }
}
