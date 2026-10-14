<?php

declare(strict_types=1);

namespace Soltec\Modules\Suppliers\Domain;

/**
 * Tax identification of a supplier or a client (ADR-0022): a NIT with its check digit, a CUI of 13 digits, or none.
 *
 * It is stored in canonical form (upper case, no spaces or hyphens) and shown with the hyphen before the check digit.
 * The CUI check digit and municipality are not validated.
 */
final class Identification
{
    public const NIT = 'nit';
    public const CUI = 'cui';
    public const NONE = 'none';

    public const TYPES = [self::NIT, self::CUI, self::NONE];

    /**
     * @return string|null the canonical form, or null when the text is not a valid identification of that type
     */
    public static function canonical(string $type, string $raw): ?string
    {
        $value = strtoupper(str_replace([' ', '-'], '', $raw));

        return match ($type) {
            self::NIT => self::isValidNit($value) ? $value : null,
            self::CUI => preg_match('/^\d{13}$/', $value) === 1 ? $value : null,
            default => null,
        };
    }

    /** `66479126` as `6647912-6`; a CUI is shown as stored. */
    public static function display(string $type, string $canonical): string
    {
        return $type === self::NIT ? substr($canonical, 0, -1) . '-' . substr($canonical, -1) : $canonical;
    }

    /** Digits times a descending weight (`n + 1` for the first, 2 for the last); check = (11 - sum mod 11) mod 11. */
    private static function isValidNit(string $value): bool
    {
        if (preg_match('/^(\d{1,12})([0-9K])$/', $value, $match) !== 1) {
            return false;
        }

        $digits = $match[1];
        $weight = strlen($digits) + 1;
        $sum = 0;
        foreach (str_split($digits) as $digit) {
            $sum += (int) $digit * $weight--;
        }
        $check = (11 - $sum % 11) % 11;

        return $match[2] === ($check === 10 ? 'K' : (string) $check);
    }
}
