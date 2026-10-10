<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Modules\Settings;

use DateTimeImmutable;
use DateTimeZone;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Soltec\Modules\Settings\Domain\SequenceFormat;
use Soltec\Modules\Settings\Domain\SequenceRecord;

final class SequenceTest extends TestCase
{
    /** @return iterable<string, array{string, int, string|null, int, string}> */
    public static function formats(): iterable
    {
        yield 'monthly' => ['COT', 4, '2610', 1, 'COT-2610-0001'];
        yield 'yearly' => ['PRY', 5, '2026', 42, 'PRY-2026-00042'];
        yield 'no period' => ['CLI', 4, null, 7, 'CLI-0007'];
        yield 'never cut' => ['OC', 2, '2610', 12345, 'OC-2610-12345'];
    }

    #[DataProvider('formats')]
    public function testFormatsTheNumber(string $prefix, int $padding, ?string $key, int $value, string $expected): void
    {
        self::assertSame($expected, SequenceFormat::format($prefix, $padding, $key, $value));
    }

    public function testThePeriodKeyIsYearAndMonthOrYear(): void
    {
        $moment = new DateTimeImmutable('2026-10-31 21:00:00', new DateTimeZone('America/Guatemala'));

        self::assertSame('2610', SequenceFormat::periodKey(SequenceFormat::MONTH, $moment));
        self::assertSame('2026', SequenceFormat::periodKey(SequenceFormat::YEAR, $moment));
        self::assertNull(SequenceFormat::periodKey(SequenceFormat::NONE, $moment));
    }

    public function testTheExampleStartsAtOneWhenThePeriodHasRolledOverButNotBeforeAnyNumberWasIssued(): void
    {
        $now = new DateTimeImmutable('2026-11-02 10:00:00');

        self::assertSame('COT-2611-0001', $this->sequence('month', '2610', 57)->example($now), 'Rolled over.');
        $sameMonth = new DateTimeImmutable('2026-10-02');
        self::assertSame('COT-2610-0057', $this->sequence('month', '2610', 57)->example($sameMonth));
        self::assertSame('COT-2611-0100', $this->sequence('month', null, 100)->example($now), 'Raised before use.');
        self::assertSame('COT-0057', $this->sequence('none', null, 57)->example($now));
    }

    public function testThePeriodIsLockedOnceNumbersWereIssued(): void
    {
        self::assertFalse($this->sequence('month', null, 1)->hasIssuedNumbers());
        self::assertTrue($this->sequence('month', '2610', 2)->hasIssuedNumbers());
        self::assertTrue($this->sequence('none', null, 2)->hasIssuedNumbers());
    }

    private function sequence(string $period, ?string $key, int $next): SequenceRecord
    {
        $at = new DateTimeImmutable('2026-10-01');
        $prefix = $period === 'none' ? 'COT' : 'COT';

        return new SequenceRecord('quote', 'Cotizaciones', $prefix, 4, $period, $key, $next, $at, $at, 1);
    }
}
