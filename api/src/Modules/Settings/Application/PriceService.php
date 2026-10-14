<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Application;

use Soltec\Kernel\Http\ValidationException;
use Soltec\Modules\Settings\Domain\MarginLevelRecord;
use Soltec\Modules\Settings\Domain\Price;
use Soltec\Modules\Settings\Domain\PriceBasis;
use Soltec\Modules\Settings\Domain\PriceCalculator;
use Soltec\Modules\Settings\Domain\PriceException;
use Soltec\Modules\Settings\Persistence\FinancialSettingsRepository;
use Soltec\Modules\Settings\Persistence\MarginLevelRepository;

/**
 * Computes a catalog price with the current VAT and income tax and a margin level (ADR-0011, ADR-0014). Nothing is
 * stored: it is the answer for "what would this cost sell for now".
 */
final class PriceService
{
    public function __construct(
        private readonly PriceCalculator $calculator,
        private readonly MarginLevelService $levels,
        private readonly MarginLevelRepository $levelRepository,
        private readonly FinancialSettingsRepository $settings,
    ) {
    }

    /**
     * The level and rates to price many costs with. Prices always start from the cost, never from another price: a
     * different level is a different basis for the same cost, so a margin is never applied on top of a margin.
     *
     * @param string|null $marginLevelId null for the default level
     * @throws ValidationException `margin_level_id` unknown or deactivated
     */
    public function basis(?string $marginLevelId): PriceBasis
    {
        $level = $marginLevelId === null ? $this->levels->default() : $this->levelRepository->find($marginLevelId);
        if ($level === null || !$level->isActive()) {
            throw ValidationException::field('margin_level_id', 'invalid');
        }
        $settings = $this->settings->get();

        return new PriceBasis(
            $level,
            $settings->vatRate,
            $settings->incomeTaxRate,
            $settings->staleCostDays,
            $settings->currencyCode,
        );
    }

    /** The price of a stored cost, or null when it would not fit (an extreme rate), which a list shows as no price. */
    public function priceFor(PriceBasis $basis, string $cost): ?Price
    {
        try {
            return $this->calculator->calculate($cost, $basis->vatRate, $basis->incomeTaxRate, $basis->level->rate);
        } catch (PriceException) {
            return null;
        }
    }

    /**
     * @param string|null $marginLevelId null for the default level
     * @return array{level: MarginLevelRecord, vat_rate: string, income_tax_rate: string, price: Price}
     * @throws ValidationException `cost` invalid or beyond the range, or `margin_level_id` unknown or deactivated
     */
    public function calculate(string $cost, ?string $marginLevelId): array
    {
        $level = $marginLevelId === null ? $this->levels->default() : $this->levelRepository->find($marginLevelId);
        if ($level === null || !$level->isActive()) {
            throw ValidationException::field('margin_level_id', 'invalid');
        }

        $settings = $this->settings->get();
        try {
            $price = $this->calculator->calculate($cost, $settings->vatRate, $settings->incomeTaxRate, $level->rate);
        } catch (PriceException $error) {
            // The stored rates were validated when saved, so a rate failure here is not the caller's fault.
            throw match ($error->reason) {
                PriceException::INVALID_COST => ValidationException::field('cost', 'invalid'),
                PriceException::PRICE_TOO_LARGE => ValidationException::field('cost', 'out_of_range'),
                default => $error,
            };
        }

        return [
            'level' => $level,
            'vat_rate' => $settings->vatRate,
            'income_tax_rate' => $settings->incomeTaxRate,
            'price' => $price,
        ];
    }
}
