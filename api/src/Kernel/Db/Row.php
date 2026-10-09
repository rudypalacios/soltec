<?php

declare(strict_types=1);

namespace Soltec\Kernel\Db;

use DateTimeImmutable;
use UnexpectedValueException;

/** Typed reads of a database row; the driver returns mixed values, so each one is checked before use. */
final class Row
{
    /** A single value from fetchOne() or fetchFirstColumn(). */
    public static function scalarString(mixed $value): string
    {
        if (!is_string($value)) {
            throw new UnexpectedValueException('The value is not a string.');
        }

        return $value;
    }

    /** @param array<string, mixed> $row */
    public static function string(array $row, string $key): string
    {
        $value = $row[$key] ?? null;
        if (!is_string($value) && !is_int($value)) {
            throw new UnexpectedValueException(sprintf('Column "%s" is not a string.', $key));
        }

        return (string) $value;
    }

    /** @param array<string, mixed> $row */
    public static function nullableString(array $row, string $key): ?string
    {
        return ($row[$key] ?? null) === null ? null : self::string($row, $key);
    }

    /** @param array<string, mixed> $row */
    public static function int(array $row, string $key): int
    {
        $value = $row[$key] ?? null;
        if (is_int($value)) {
            return $value;
        }
        if (is_string($value) && filter_var($value, FILTER_VALIDATE_INT) !== false) {
            return (int) $value;
        }

        throw new UnexpectedValueException(sprintf('Column "%s" is not an integer.', $key));
    }

    /** @param array<string, mixed> $row */
    public static function bool(array $row, string $key): bool
    {
        return self::int($row, $key) === 1;
    }

    /** @param array<string, mixed> $row */
    public static function date(array $row, string $key): DateTimeImmutable
    {
        return Timestamps::fromDb(self::string($row, $key));
    }

    /** @param array<string, mixed> $row */
    public static function nullableDate(array $row, string $key): ?DateTimeImmutable
    {
        return ($row[$key] ?? null) === null ? null : self::date($row, $key);
    }
}
