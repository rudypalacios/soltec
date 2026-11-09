<?php

declare(strict_types=1);

namespace Soltec\Modules\Files\Application;

/**
 * Where the bytes of a photo live (ADR-0009). The application only knows this interface, so moving to another
 * storage changes one class and the container entry.
 */
interface FileStorage
{
    public const NORMAL = 'normal';
    public const THUMBNAIL = 'thumbnail';

    /** @return string the path to keep in the database; the same file id and size always give the same path */
    public function store(string $fileId, string $size, string $webp): string;

    /** @return string|null the file's content, or null when the path is not one this storage wrote or the file is gone */
    public function read(string $path): ?string;

    /** Removes a file written by a failed upload. A path that is not this storage's, or is gone, is ignored. */
    public function delete(string $path): void;
}
