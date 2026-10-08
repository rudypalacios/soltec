<?php

declare(strict_types=1);

namespace Soltec\Kernel\Deploy;

use RuntimeException;

/** Raised when another request is already applying migrations on this database. */
final class MigrationInProgressException extends RuntimeException
{
}
