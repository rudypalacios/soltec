<?php

declare(strict_types=1);

namespace Soltec\Kernel\Db;

use DateTimeImmutable;
use DateTimeZone;

/** Conversions between DateTimeImmutable and the DATETIME(3) UTC columns and the ISO 8601 of the API. */
final class Timestamps
{
    public static function toDb(DateTimeImmutable $moment): string
    {
        return $moment->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.v');
    }

    public static function fromDb(string $value): DateTimeImmutable
    {
        return new DateTimeImmutable($value, new DateTimeZone('UTC'));
    }

    public static function toIso(DateTimeImmutable $moment): string
    {
        return $moment->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
    }

    public static function toIsoOrNull(?DateTimeImmutable $moment): ?string
    {
        return $moment === null ? null : self::toIso($moment);
    }
}
