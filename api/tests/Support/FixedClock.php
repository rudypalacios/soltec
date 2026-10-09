<?php

declare(strict_types=1);

namespace Soltec\Tests\Support;

use DateTimeImmutable;
use DateTimeZone;
use Soltec\Kernel\Clock;

/** A clock that only moves when the test says so. */
final class FixedClock implements Clock
{
    private DateTimeImmutable $now;

    public function __construct(string $moment = '2026-10-09 12:00:00')
    {
        $this->now = new DateTimeImmutable($moment, new DateTimeZone('UTC'));
    }

    public function now(): DateTimeImmutable
    {
        return $this->now;
    }

    public function advance(string $interval): void
    {
        $this->now = $this->now->modify($interval);
    }
}
