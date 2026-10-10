<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Settings;

final class FinancialSettingsTest extends SettingsTestCase
{
    /**
     * @param array<string, mixed> $changes
     * @return array<string, mixed>
     */
    private function body(array $changes = []): array
    {
        return $changes + [
            'version' => 1,
            'vat_rate' => '0.12',
            'income_tax_rate' => '0.05',
            'stale_cost_days' => 120,
            'quote_validity_days' => 30,
        ];
    }

    public function testStartsWithTheDefaultsOfTheRequirements(): void
    {
        $settings = $this->json($this->api('GET', '/settings/financial', $this->adminToken));

        self::assertSame('GTQ', $settings['currency_code']);
        self::assertSame('0.12000', $settings['vat_rate']);
        self::assertSame('0.03000', $settings['income_tax_rate']);
        self::assertSame(15, $settings['quote_validity_days']);
        self::assertSame(90, $settings['stale_cost_days']);
    }

    public function testUpdatesAndAuditsTheChangedValuesOnly(): void
    {
        $response = $this->api('PATCH', '/settings/financial', $this->adminToken, $this->body());

        self::assertSame(200, $response->getStatusCode());
        $settings = $this->json($response);
        self::assertSame('0.05000', $settings['income_tax_rate']);
        self::assertSame(2, $settings['version']);

        $audit = $this->auditEntries('financial_settings');
        self::assertCount(1, $audit);
        self::assertSame(
            ['income_tax_rate' => '0.03000', 'stale_cost_days' => 90, 'quote_validity_days' => 15],
            $audit[0]['before'],
        );
        self::assertSame(
            ['income_tax_rate' => '0.05000', 'stale_cost_days' => 120, 'quote_validity_days' => 30],
            $audit[0]['after'],
        );
    }

    public function testTheCurrencyCannotBeChanged(): void
    {
        $this->api('PATCH', '/settings/financial', $this->adminToken, $this->body(['currency_code' => 'USD']));

        $settings = $this->json($this->api('GET', '/settings/financial', $this->adminToken));
        self::assertSame('GTQ', $settings['currency_code']);
    }

    public function testRatesAreStringsBetweenZeroAndOneExclusive(): void
    {
        $invalid = ['vat_rate' => 0.12, 'income_tax_rate' => 'abc'];
        $response = $this->api('PATCH', '/settings/financial', $this->adminToken, $this->body($invalid));
        $errors = $this->errorCodes($response);
        self::assertSame(['vat_rate' => 'invalid', 'income_tax_rate' => 'invalid'], $errors);

        $outOfRange = ['vat_rate' => '1', 'income_tax_rate' => '0.123456'];
        $response = $this->api('PATCH', '/settings/financial', $this->adminToken, $this->body($outOfRange));
        $errors = $this->errorCodes($response);
        self::assertSame(['vat_rate' => 'out_of_range', 'income_tax_rate' => 'invalid'], $errors);

        $zero = $this->api('PATCH', '/settings/financial', $this->adminToken, $this->body(['vat_rate' => '0']));
        self::assertSame('0.00000', $this->json($zero)['vat_rate']);
    }

    public function testDaysAreWholeNumbersInRange(): void
    {
        $body = $this->body(['stale_cost_days' => 0, 'quote_validity_days' => '15']);

        $errors = $this->errorCodes($this->api('PATCH', '/settings/financial', $this->adminToken, $body));

        self::assertSame(['stale_cost_days' => 'out_of_range', 'quote_validity_days' => 'invalid'], $errors);
    }

    public function testRejectsAStaleVersionAndNeedsThePermission(): void
    {
        $this->api('PATCH', '/settings/financial', $this->adminToken, $this->body());

        self::assertSame(409, $this->statusOf('PATCH', '/settings/financial', $this->adminToken, $this->body()));
        $viewer = $this->tokenWith('financial_settings', 'view');
        self::assertSame(200, $this->statusOf('GET', '/settings/financial', $viewer));
        self::assertSame(403, $this->statusOf('PATCH', '/settings/financial', $viewer, $this->body(['version' => 2])));
    }
}
