<?php

declare(strict_types=1);

namespace Soltec\Modules\Files\Application;

use Soltec\Kernel\Auth\CurrentUser;

/**
 * Lets a module that adopts photos (the thread of a task or a ticket) open them to more people than their uploader:
 * whoever can see the record sees its photos (ADR-0027). Files does not know which modules adopt photos.
 */
interface FileAccessGrant
{
    /** Whether a record the user reaches carries this photo. */
    public function mayRead(CurrentUser $reader, string $fileId): bool;
}
