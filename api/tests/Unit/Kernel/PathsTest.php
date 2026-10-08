<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel;

use PHPUnit\Framework\TestCase;
use Soltec\Kernel\Paths;

final class PathsTest extends TestCase
{
    private string $root;

    protected function setUp(): void
    {
        $this->root = sys_get_temp_dir() . '/soltec-paths-' . bin2hex(random_bytes(4));
        mkdir($this->root . '/api', 0777, true);
    }

    protected function tearDown(): void
    {
        foreach ([$this->root . '/public', $this->root . '/api', $this->root] as $directory) {
            if (is_dir($directory)) {
                rmdir($directory);
            }
        }
    }

    public function testRepositoryLayoutKeepsEnvAndStorageInsideApi(): void
    {
        $paths = new Paths($this->root . '/api');

        self::assertFalse($paths->isDeployed());
        self::assertSame($this->root . '/api', $paths->envDirectory());
        self::assertSame($this->root . '/api/storage', $paths->storageDirectory());
        self::assertSame($this->root . '/db/migrations', $paths->migrationsDirectory());
    }

    public function testDeployedLayoutKeepsEnvAndStorageAtTheInstanceRoot(): void
    {
        mkdir($this->root . '/public');
        $paths = new Paths($this->root . '/api');

        self::assertTrue($paths->isDeployed());
        self::assertSame($this->root, $paths->envDirectory());
        self::assertSame($this->root . '/storage', $paths->storageDirectory());
        self::assertSame($this->root . '/db/migrations', $paths->migrationsDirectory());
    }
}
