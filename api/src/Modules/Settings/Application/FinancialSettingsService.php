<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Application;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Settings\Domain\FinancialSettingsRecord;
use Soltec\Modules\Settings\Persistence\FinancialSettingsRepository;

/** Tax rates and business-rule periods. Quotes keep the values they were issued with; changing these never edits them. */
final class FinancialSettingsService
{
    private const ENTITY = 'financial_settings';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly FinancialSettingsRepository $settings,
        private readonly AuditLogger $audit,
    ) {
    }

    public function get(): FinancialSettingsRecord
    {
        return $this->settings->get();
    }

    /** @throws ApiException 409 `conflict` when the version is stale */
    public function update(
        ActorContext $actor,
        int $version,
        string $vatRate,
        string $incomeTaxRate,
        int $staleCostDays,
        int $quoteValidityDays,
    ): FinancialSettingsRecord {
        $this->connection->transactional(function () use (
            $actor,
            $version,
            $vatRate,
            $incomeTaxRate,
            $staleCostDays,
            $quoteValidityDays,
        ): void {
            $current = $this->settings->get(lock: true);
            if ($current->version !== $version) {
                throw ApiException::conflict();
            }

            $before = $current->auditData();
            $after = [
                'vat_rate' => $vatRate,
                'income_tax_rate' => $incomeTaxRate,
                'stale_cost_days' => $staleCostDays,
                'quote_validity_days' => $quoteValidityDays,
            ];
            $changed = array_keys(array_diff_assoc($after, $before));
            if ($changed === []) {
                return;
            }

            $this->settings->update(
                $vatRate,
                $incomeTaxRate,
                $staleCostDays,
                $quoteValidityDays,
                $version,
                $this->clock->now(),
            );
            $this->audit->record(
                $actor,
                'update',
                self::ENTITY,
                $current->id,
                array_intersect_key($before, array_flip($changed)),
                array_intersect_key($after, array_flip($changed)),
            );
        });

        return $this->settings->get();
    }
}
