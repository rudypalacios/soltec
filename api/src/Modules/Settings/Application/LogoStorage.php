<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Application;

use RuntimeException;
use Soltec\Kernel\Paths;

/**
 * Keeps the logo file under `storage/branding/`, which the web server does not serve: the API streams it. The name
 * carries a hash of the content, so a new logo is a new file and the old one can be cached forever.
 */
final class LogoStorage
{
    private const DIRECTORY = 'branding';
    private const NAME_PATTERN = '/^branding\/logo-[0-9a-f]{16}\.webp$/';

    public function __construct(private readonly Paths $paths)
    {
    }

    /** @return string the path to keep in `company.logo_path`, relative to the storage directory */
    public function store(string $webp): string
    {
        $directory = $this->paths->storageDirectory() . '/' . self::DIRECTORY;
        if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
            throw new RuntimeException('Cannot create the branding directory.');
        }

        $relative = sprintf('%s/logo-%s.webp', self::DIRECTORY, substr(sha1($webp), 0, 16));
        $target = $this->paths->storageDirectory() . '/' . $relative;
        // Written next to the target and renamed, so a reader never sees half a file.
        $temporary = $target . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (file_put_contents($temporary, $webp) === false || !rename($temporary, $target)) {
            @unlink($temporary);
            throw new RuntimeException('Cannot write the logo file.');
        }

        return $relative;
    }

    /** @return string|null the file's content, or null when the path is not a logo path or the file is gone */
    public function read(string $relative): ?string
    {
        $path = $this->absolute($relative);
        $content = $path === null || !is_file($path) ? false : file_get_contents($path);

        return $content === false ? null : $content;
    }

    public function delete(string $relative): void
    {
        $path = $this->absolute($relative);
        if ($path !== null && is_file($path)) {
            unlink($path);
        }
    }

    /** Only paths this class wrote are resolved, so a corrupted column can never point elsewhere. */
    private function absolute(string $relative): ?string
    {
        return preg_match(self::NAME_PATTERN, $relative) === 1
            ? $this->paths->storageDirectory() . '/' . $relative
            : null;
    }
}
