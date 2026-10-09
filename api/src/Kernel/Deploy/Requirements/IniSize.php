<?php

declare(strict_types=1);

namespace Soltec\Kernel\Deploy\Requirements;

/** Converts php.ini sizes ("128M", "2G", "512K", "-1") to bytes; -1 means unlimited. */
final class IniSize
{
    public const UNLIMITED = PHP_INT_MAX;

    public static function toBytes(string $value): int
    {
        $value = trim($value);
        if ($value === '-1') {
            return self::UNLIMITED;
        }
        if (preg_match('/^(\d+)\s*([KMG]?)B?$/i', $value, $parts) !== 1) {
            return 0;
        }

        $multiplier = match (strtoupper($parts[2])) {
            'K' => 1024,
            'M' => 1024 ** 2,
            'G' => 1024 ** 3,
            default => 1,
        };

        return (int) $parts[1] * $multiplier;
    }
}
