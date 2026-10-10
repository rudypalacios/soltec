<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Domain;

/**
 * The catalog price function (ADR-0011): the price is never stored, it is computed from the cost, a margin level
 * and the tax rates.
 *
 *   without_vat = ((cost / (1 + VAT)) / (1 − MC)) / (1 − ISR)
 *   with_vat    = without_vat × (1 + VAT)
 *
 * The server is the source of truth (ADR-0014); `shared/src/domain/price.ts` repeats it only for a live preview and
 * both are tested against `contract/test-vectors/price.json`. A change here starts by changing the vectors.
 *
 * It is exact: costs and rates are decimal strings turned into integers and the quotient is a long division that
 * rounds half up once, to cents, at the end. No float and no bcmath (the hosting is not guaranteed to have it). The
 * VAT cancels in `with_vat = cost / ((1 − MC) × (1 − ISR))`, so each amount is a single division.
 */
final class PriceCalculator
{
    /** Largest cost: nine integer digits and four decimals, like a supplier invoice line. */
    private const COST_PATTERN = '/^(\d{1,9})(?:\.(\d{1,4}))?$/';
    private const RATE_PATTERN = '/^0(?:\.(\d{1,5}))?$/';
    private const RATE_UNIT = 100_000;
    /** Prices of 10^13 or more are refused: they are a typo, and the long division would overflow an int. */
    private const MAX_CENTS = 999_999_999_999_999;

    /**
     * @param string $cost decimal with up to four decimals, as on the supplier's invoice (VAT included)
     * @param string $vatRate $incomeTaxRate $marginRate decimal strings from 0 up to, not including, 1
     * @throws PriceException
     */
    public function calculate(string $cost, string $vatRate, string $incomeTaxRate, string $marginRate): Price
    {
        $costUnits = $this->costUnits($cost);
        $vat = $this->rateUnits($vatRate);
        $incomeTax = $this->rateUnits($incomeTaxRate);
        $margin = $this->rateUnits($marginRate);

        $afterMargin = self::RATE_UNIT - $margin;
        $afterIncomeTax = self::RATE_UNIT - $incomeTax;
        $withVatDivisor = $afterMargin * $afterIncomeTax;
        $withoutVatDivisor = (self::RATE_UNIT + $vat) * $withVatDivisor;

        // cost is in 10^-4 and each factor in 10^-5, so the exponents bring the quotient to cents.
        return new Price(
            $this->formatCents($this->divideRounded($costUnits, 13, $withoutVatDivisor)),
            $this->formatCents($this->divideRounded($costUnits, 8, $withVatDivisor)),
        );
    }

    private function costUnits(string $cost): int
    {
        if (preg_match(self::COST_PATTERN, $cost, $match) !== 1) {
            throw new PriceException(PriceException::INVALID_COST);
        }

        return (int) ($match[1] . str_pad($match[2] ?? '', 4, '0'));
    }

    private function rateUnits(string $rate): int
    {
        if (preg_match(self::RATE_PATTERN, $rate, $match) !== 1) {
            throw new PriceException(PriceException::INVALID_RATE);
        }

        return (int) str_pad($match[1] ?? '', 5, '0');
    }

    /**
     * round_half_up(numerator × 10^zeros / divisor) by long division, one digit at a time. The remainder stays below
     * the divisor (at most 2 × 10^15), so multiplying it by ten never overflows.
     */
    private function divideRounded(int $numerator, int $zeros, int $divisor): int
    {
        $quotient = intdiv($numerator, $divisor);
        $remainder = $numerator % $divisor;
        for ($step = 0; $step < $zeros; $step++) {
            if ($quotient > self::MAX_CENTS) {
                throw new PriceException(PriceException::PRICE_TOO_LARGE);
            }
            $remainder *= 10;
            $quotient = $quotient * 10 + intdiv($remainder, $divisor);
            $remainder %= $divisor;
        }
        if ($remainder * 2 >= $divisor) {
            $quotient++;
        }
        if ($quotient > self::MAX_CENTS) {
            throw new PriceException(PriceException::PRICE_TOO_LARGE);
        }

        return $quotient;
    }

    private function formatCents(int $cents): string
    {
        return intdiv($cents, 100) . '.' . str_pad((string) ($cents % 100), 2, '0', STR_PAD_LEFT);
    }
}
