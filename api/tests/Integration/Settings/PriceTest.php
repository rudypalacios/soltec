<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Settings;

final class PriceTest extends SettingsTestCase
{
    public function testUsesTheDefaultLevelAndTheCurrentTaxes(): void
    {
        $response = $this->api('POST', '/price/calculate', $this->adminToken, ['cost' => '525.01']);

        self::assertSame(200, $response->getStatusCode());
        $price = $this->json($response);
        self::assertSame('721.28', $price['without_vat']);
        self::assertSame('807.83', $price['with_vat']);
        self::assertSame('0.12000', $price['vat_rate']);
        self::assertSame('0.03000', $price['income_tax_rate']);
        $level = $price['margin_level'];
        self::assertIsArray($level);
        self::assertSame(['id', 'name', 'rate'], array_keys($level));
        self::assertSame('0.33000', $level['rate']);
    }

    public function testComputesWithTheRequestedLevel(): void
    {
        $level = $this->marginLevelId('Margen 35 %');

        $price = $this->json($this->api('POST', '/price/calculate', $this->adminToken, [
            'cost' => '525.01',
            'margin_level_id' => $level,
        ]));

        self::assertSame('743.47', $price['without_vat']);
        self::assertSame('832.69', $price['with_vat']);
    }

    public function testChangingARateChangesTheNextAnswerWithoutTouchingAnyStoredPrice(): void
    {
        $id = $this->marginLevelId('Margen 33 %');
        $this->api('PATCH', '/margin-levels/' . $id, $this->adminToken, [
            'version' => 1,
            'name' => 'Margen 33 %',
            'rate' => '0.5',
        ]);

        $price = $this->json($this->api('POST', '/price/calculate', $this->adminToken, ['cost' => '100']));

        self::assertSame('0.50000', $this->text($price, 'margin_level', 'rate'));
        self::assertSame('184.09', $price['without_vat']);
    }

    public function testChangingTheTaxesChangesThePrice(): void
    {
        $this->api('PATCH', '/settings/financial', $this->adminToken, [
            'version' => 1,
            'vat_rate' => '0',
            'income_tax_rate' => '0',
            'stale_cost_days' => 90,
            'quote_validity_days' => 15,
        ]);

        $price = $this->json($this->api('POST', '/price/calculate', $this->adminToken, ['cost' => '67']));

        self::assertSame('100.00', $price['without_vat']);
        self::assertSame('100.00', $price['with_vat']);
    }

    /**
     * @param array<string, mixed> $body
     * @return array<string, string>
     */
    private function errorsOf(array $body): array
    {
        return $this->errorCodes($this->api('POST', '/price/calculate', $this->adminToken, $body));
    }

    public function testRefusesAnInvalidCostOrLevel(): void
    {
        self::assertSame(['cost' => 'required'], $this->errorsOf([]));
        self::assertSame(['cost' => 'invalid'], $this->errorsOf(['cost' => '1,5']));
        self::assertSame(['cost' => 'invalid'], $this->errorsOf(['cost' => '-1']));
        self::assertSame(['cost' => 'invalid'], $this->errorsOf(['cost' => 12.5]));
        $unknownShape = ['cost' => '1', 'margin_level_id' => 'abc'];
        self::assertSame(['margin_level_id' => 'invalid'], $this->errorsOf($unknownShape));
        self::assertSame(
            ['margin_level_id' => 'invalid'],
            $this->errorsOf(['cost' => '1', 'margin_level_id' => '0190a000-0000-7000-8000-000000000000']),
        );
    }

    public function testADeactivatedLevelCannotPriceAnything(): void
    {
        $id = $this->marginLevelId('Margen 35 %');
        $this->api('POST', "/margin-levels/$id/deactivate", $this->adminToken);

        $response = $this->api('POST', '/price/calculate', $this->adminToken, [
            'cost' => '1',
            'margin_level_id' => $id,
        ]);

        self::assertSame(['margin_level_id' => 'invalid'], $this->errorCodes($response));
    }

    public function testAPriceBeyondTheSupportedRangeIsOutOfRange(): void
    {
        $this->connection->executeStatement('UPDATE financial_settings SET income_tax_rate = 0.99999');
        $id = $this->marginLevelId('Margen 35 %');
        $this->connection->executeStatement("UPDATE margin_levels SET rate = 0.99999 WHERE name = 'Margen 35 %'");

        $response = $this->api('POST', '/price/calculate', $this->adminToken, [
            'cost' => '999999999.9999',
            'margin_level_id' => $id,
        ]);

        self::assertSame(['cost' => 'out_of_range'], $this->errorCodes($response));
    }

    public function testNeedsTheViewPermission(): void
    {
        $body = ['cost' => '1'];

        self::assertSame(401, $this->statusOf('POST', '/price/calculate', null, $body));
        self::assertSame(403, $this->statusOf('POST', '/price/calculate', $this->tokenWith('roles', 'view'), $body));
        $viewer = $this->tokenWith('margin_levels', 'view');
        self::assertSame(200, $this->statusOf('POST', '/price/calculate', $viewer, $body));
    }
}
