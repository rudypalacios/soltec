<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * The deployment applies migrations before it uploads the new application code, so a migration that uses a class of
 * the application fails on the server while it passes everywhere else (it did, once: a seed that called Uuid).
 */
final class MigrationsAreSelfContainedTest extends TestCase
{
    public function testNoMigrationReferencesTheApplication(): void
    {
        $offenders = [];
        foreach (glob(dirname(__DIR__, 3) . '/db/migrations/*.php') ?: [] as $file) {
            if (preg_match('/\bSoltec\\\\/', (string) file_get_contents($file)) === 1) {
                $offenders[] = basename($file);
            }
        }

        self::assertSame([], $offenders, 'Migrations must not use application classes.');
    }
}
