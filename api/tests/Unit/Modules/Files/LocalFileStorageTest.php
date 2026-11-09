<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Modules\Files;

use PHPUnit\Framework\TestCase;
use RuntimeException;
use Soltec\Kernel\Paths;
use Soltec\Modules\Files\Application\FileStorage;
use Soltec\Modules\Files\Persistence\LocalFileStorage;

final class LocalFileStorageTest extends TestCase
{
    private const ID = '0192f1c2-7d3a-7a11-8f2e-00000000f001';

    private string $root;
    private LocalFileStorage $storage;

    protected function setUp(): void
    {
        $this->root = sys_get_temp_dir() . '/soltec-storage-' . bin2hex(random_bytes(6));
        mkdir($this->root, 0700, true);
        $this->storage = new LocalFileStorage(new Paths($this->root));
    }

    protected function tearDown(): void
    {
        foreach (glob($this->root . '/storage/files/*/*') ?: [] as $file) {
            unlink($file);
        }
        foreach (glob($this->root . '/storage/files/*') ?: [] as $directory) {
            rmdir($directory);
        }
        @rmdir($this->root . '/storage/files');
        @rmdir($this->root . '/storage');
        rmdir($this->root);
    }

    public function testKeepsAFileUnderAFolderOfItsFirstTwoDigitsAndReadsItBack(): void
    {
        $path = $this->storage->store(self::ID, FileStorage::NORMAL, 'webp bytes');

        self::assertSame('files/01/' . self::ID . '-normal.webp', $path);
        self::assertSame('webp bytes', $this->storage->read($path));
        $thumbnail = $this->storage->store(self::ID, FileStorage::THUMBNAIL, 'thumb');
        self::assertSame('thumb', $this->storage->read($thumbnail));
    }

    public function testStoringAgainReplacesTheFileAndLeavesNoTemporaryOne(): void
    {
        $path = $this->storage->store(self::ID, FileStorage::NORMAL, 'one');
        $this->storage->store(self::ID, FileStorage::NORMAL, 'two');

        self::assertSame('two', $this->storage->read($path));
        self::assertCount(1, glob($this->root . '/storage/files/01/*') ?: []);
    }

    public function testNeverReadsOrDeletesAPathItDidNotWrite(): void
    {
        $outside = $this->root . '/secret.txt';
        file_put_contents($outside, 'secret');

        foreach (['../secret.txt', 'files/../../secret.txt', '/etc/passwd', 'files/01/x-normal.webp', ''] as $path) {
            self::assertNull($this->storage->read($path), $path);
            $this->storage->delete($path);
        }
        self::assertFileExists($outside);
        unlink($outside);
    }

    public function testDeleteRemovesAFileItWrote(): void
    {
        $path = $this->storage->store(self::ID, FileStorage::NORMAL, 'bytes');

        $this->storage->delete($path);
        $this->storage->delete($path);

        self::assertNull($this->storage->read($path));
    }

    public function testRefusesAnIdThatIsNotAUuidSoNothingClientSideReachesThePath(): void
    {
        $this->expectException(RuntimeException::class);

        $this->storage->store('../../x', FileStorage::NORMAL, 'bytes');
    }
}
