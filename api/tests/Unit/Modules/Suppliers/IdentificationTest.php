<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Modules\Suppliers;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Soltec\Modules\Suppliers\Domain\Identification;

/** Runs the vectors of `contract/test-vectors/identification.json`. */
final class IdentificationTest extends TestCase
{
    /** @return array<string, array{array<string, string>}> */
    public static function validVectors(): array
    {
        return self::vectors('valid');
    }

    /** @return array<string, array{array<string, string>}> */
    public static function invalidVectors(): array
    {
        return self::vectors('invalid');
    }

    /** @param array<string, string> $vector */
    #[DataProvider('validVectors')]
    public function testAcceptsAndNormalisesValidIdentifications(array $vector): void
    {
        $canonical = Identification::canonical($vector['type'], $vector['input']);

        self::assertSame($vector['canonical'], $canonical);
        self::assertSame($vector['display'], Identification::display($vector['type'], (string) $canonical));
    }

    /** @param array<string, string> $vector */
    #[DataProvider('invalidVectors')]
    public function testRejectsInvalidIdentifications(array $vector): void
    {
        self::assertNull(Identification::canonical($vector['type'], $vector['input']));
    }

    /** @return array<string, array{array<string, string>}> */
    private static function vectors(string $group): array
    {
        $file = dirname(__DIR__, 5) . '/contract/test-vectors/identification.json';
        $decoded = json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($decoded);
        $rows = $decoded[$group] ?? [];
        self::assertIsArray($rows);

        $cases = [];
        foreach ($rows as $row) {
            self::assertIsArray($row);
            $vector = [];
            foreach ($row as $key => $value) {
                self::assertIsString($value);
                $vector[(string) $key] = $value;
            }
            $cases[$vector['type'] . ' "' . $vector['input'] . '"'] = [$vector];
        }

        return $cases;
    }
}
