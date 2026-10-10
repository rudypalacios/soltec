<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Modules\Settings;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Soltec\Modules\Settings\Domain\PriceCalculator;
use Soltec\Modules\Settings\Domain\PriceException;

/** The same vectors run in Vitest against `shared/src/domain/price.ts` (ADR-0014). */
final class PriceCalculatorTest extends TestCase
{
    /** @return array<string, array{array<string, string>}> */
    public static function validVectors(): array
    {
        return self::vectors('cases');
    }

    /** @return array<string, array{array<string, string>}> */
    public static function invalidVectors(): array
    {
        return self::vectors('invalid');
    }

    /** @param array<string, string> $vector */
    #[DataProvider('validVectors')]
    public function testComputesTheSharedVectors(array $vector): void
    {
        $price = (new PriceCalculator())->calculate(
            $vector['cost'],
            $vector['vat_rate'],
            $vector['income_tax_rate'],
            $vector['margin_rate'],
        );

        self::assertSame($vector['without_vat'], $price->withoutVat);
        self::assertSame($vector['with_vat'], $price->withVat);
    }

    /** @param array<string, string> $vector */
    #[DataProvider('invalidVectors')]
    public function testRefusesTheSharedInvalidVectors(array $vector): void
    {
        try {
            (new PriceCalculator())->calculate(
                $vector['cost'],
                $vector['vat_rate'],
                $vector['income_tax_rate'],
                $vector['margin_rate'],
            );
            self::fail('The price function accepted ' . $vector['name']);
        } catch (PriceException $error) {
            self::assertSame($vector['error'], $error->reason);
        }
    }

    public function testTheVectorFileIsNotEmpty(): void
    {
        self::assertGreaterThanOrEqual(3, count(self::vectors('cases')));
        self::assertGreaterThanOrEqual(3, count(self::vectors('invalid')));
    }

    /** @return array<string, array{array<string, string>}> */
    private static function vectors(string $section): array
    {
        $path = dirname(__DIR__, 5) . '/contract/test-vectors/price.json';
        $file = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($file);
        $rows = $file[$section] ?? [];
        self::assertIsArray($rows);

        $vectors = [];
        foreach ($rows as $row) {
            self::assertIsArray($row);
            $vector = [];
            foreach ($row as $key => $value) {
                self::assertIsString($value);
                $vector[(string) $key] = $value;
            }
            $vectors[$vector['name'] ?? ''] = [$vector];
        }

        return $vectors;
    }
}
