<?php

declare(strict_types=1);

namespace Soltec\Kernel;

use DateTimeImmutable;
use DateTimeZone;

/** The real clock. */
final class SystemClock implements Clock
{
    public function now(): DateTimeImmutable
    {
        return new DateTimeImmutable('now', new DateTimeZone('UTC'));
    }
}
