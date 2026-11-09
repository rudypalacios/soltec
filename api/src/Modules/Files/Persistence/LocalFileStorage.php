<?php

declare(strict_types=1);

namespace Soltec\Modules\Files\Persistence;

use RuntimeException;
use Soltec\Kernel\Paths;
use Soltec\Modules\Files\Application\FileStorage;

/**
 * Keeps the files under `storage/files/`, which the web server does not serve: the API streams them after checking
 * who asks. The name carries the id of the file, so nothing a client sends reaches the path, and a folder per two
 * hex digits keeps any directory from growing without bound.
 */
final class LocalFileStorage implements FileStorage
{
    private const DIRECTORY = 'files';
    private const NAME_PATTERN = '/^files\/[0-9a-f]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
        . '-(normal|thumbnail)\.webp$/';

    public function __construct(private readonly Paths $paths)
    {
    }

    public function store(string $fileId, string $size, string $webp): string
    {
        $relative = sprintf('%s/%s/%s-%s.webp', self::DIRECTORY, substr($fileId, 0, 2), $fileId, $size);
        if (preg_match(self::NAME_PATTERN, $relative) !== 1) {
            throw new RuntimeException('Not a file name this storage can keep.');
        }

        $target = $this->paths->storageDirectory() . '/' . $relative;
        $directory = dirname($target);
        if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
            throw new RuntimeException('Cannot create the files directory.');
        }

        // Written next to the target and renamed, so a reader never sees half a file.
        $temporary = $target . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (file_put_contents($temporary, $webp) === false || !rename($temporary, $target)) {
            @unlink($temporary);
            throw new RuntimeException('Cannot write the photo file.');
        }

        return $relative;
    }

    public function read(string $path): ?string
    {
        $absolute = $this->absolute($path);
        $content = $absolute === null || !is_file($absolute) ? false : file_get_contents($absolute);

        return $content === false ? null : $content;
    }

    public function delete(string $path): void
    {
        $absolute = $this->absolute($path);
        if ($absolute !== null && is_file($absolute)) {
            unlink($absolute);
        }
    }

    /** Only paths this class wrote are resolved, so a corrupted column can never point elsewhere. */
    private function absolute(string $path): ?string
    {
        return preg_match(self::NAME_PATTERN, $path) === 1 ? $this->paths->storageDirectory() . '/' . $path : null;
    }
}
