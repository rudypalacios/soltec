<?php

declare(strict_types=1);

namespace Soltec\Kernel;

use DateTimeImmutable;

/** The only source of "now" in the application, always in UTC (ADR-0012). Tests inject a fixed one. */
interface Clock
{
    public function now(): DateTimeImmutable;
}
