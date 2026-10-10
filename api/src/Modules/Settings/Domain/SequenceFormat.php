<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Domain;

use DateTimeImmutable;

/**
 * How a document number is written: `PREFIX-[PERIOD-]NUMBER`, for example `COT-2610-0001`. The period is the year and
 * month (`2610` = October 2026) or the year (`2026`), and the counter starts again at 1 when it changes. The counter
 * is unique inside a period, so the whole number is unique whatever the prefix.
 */
final class SequenceFormat
{
    public const NONE = 'none';
    public const YEAR = 'year';
    public const MONTH = 'month';
    public const PERIODS = [self::NONE, self::YEAR, self::MONTH];

    /** The period a moment falls in, as written in the number; null when the sequence has no period. */
    public static function periodKey(string $period, DateTimeImmutable $localMoment): ?string
    {
        return match ($period) {
            self::YEAR => $localMoment->format('Y'),
            self::MONTH => $localMoment->format('ym'),
            default => null,
        };
    }

    /** The number is padded to $padding digits and never cut, so a larger counter simply gets longer. */
    public static function format(string $prefix, int $padding, ?string $periodKey, int $value): string
    {
        $parts = [$prefix];
        if ($periodKey !== null) {
            $parts[] = $periodKey;
        }
        $parts[] = str_pad((string) $value, $padding, '0', STR_PAD_LEFT);

        return implode('-', $parts);
    }
}
