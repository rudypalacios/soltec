<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Settings;

use Psr\Http\Message\ResponseInterface;
use Soltec\Kernel\Paths;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Settings\Application\LogoStorage;
use Soltec\Tests\Integration\Access\AccessTestCase;

/** Base for the settings tests: logos are written to a temporary directory, never to the real storage. */
abstract class SettingsTestCase extends AccessTestCase
{
    protected string $storageRoot = '';
    protected string $adminToken = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminToken = $this->tokenFor($this->createAdmin()['id']);
    }

    protected function tearDown(): void
    {
        if ($this->storageRoot !== '') {
            $this->removeDirectory($this->storageRoot);
        }
        parent::tearDown();
    }

    /** @return array<string, mixed> */
    protected function containerDefinitions(): array
    {
        $this->storageRoot = sys_get_temp_dir() . '/soltec-test-' . bin2hex(random_bytes(6));
        mkdir($this->storageRoot, 0700, true);

        return parent::containerDefinitions() + [LogoStorage::class => new LogoStorage(new Paths($this->storageRoot))];
    }

    /** @param array<string, mixed>|null $body */
    protected function statusOf(string $method, string $path, ?string $token = null, ?array $body = null): int
    {
        return $this->api($method, $path, $token, $body)->getStatusCode();
    }

    /** A request whose body is raw bytes, as the logo upload sends them. */
    protected function sendBytes(
        string $method,
        string $path,
        ?string $token,
        string $bytes,
        string $type = 'image/png',
    ): ResponseInterface {
        $headers = ['Content-Type' => $type];
        if ($token !== null) {
            $headers['Authorization'] = 'Bearer ' . $token;
        }

        return $this->call($method, '/api/v1' . $path, $headers, $bytes);
    }

    /** A real PNG of the given size, half transparent so the alpha channel can be checked. */
    protected function png(int $width, int $height, bool $transparent = true): string
    {
        $image = imagecreatetruecolor(max(1, $width), max(1, $height));
        imagealphablending($image, false);
        imagesavealpha($image, true);
        imagefill($image, 0, 0, (int) imagecolorallocatealpha($image, 11, 107, 176, $transparent ? 64 : 0));
        ob_start();
        imagepng($image);

        return (string) ob_get_clean();
    }

    /** @return list<string> the files under storage/branding */
    protected function brandingFiles(): array
    {
        $files = glob($this->storageRoot . '/storage/branding/*') ?: [];
        sort($files);

        return array_map('basename', $files);
    }

    /** The id (with dashes) of the margin level with this name, read from the database. */
    protected function marginLevelId(string $name): string
    {
        $hex = $this->connection->fetchOne(
            'SELECT LOWER(HEX(id)) FROM margin_levels WHERE name = :name',
            ['name' => $name],
        );
        self::assertIsString($hex, "No margin level named $name.");

        return Uuid::fromHex($hex);
    }

    private function removeDirectory(string $directory): void
    {
        foreach (glob($directory . '/{,.}*', GLOB_BRACE) ?: [] as $entry) {
            if (in_array(basename($entry), ['.', '..'], true)) {
                continue;
            }
            is_dir($entry) ? $this->removeDirectory($entry) : unlink($entry);
        }
        rmdir($directory);
    }
}
