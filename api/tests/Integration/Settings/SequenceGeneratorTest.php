<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Settings;

use Doctrine\DBAL\Connection;
use LogicException;
use RuntimeException;
use Soltec\Modules\Settings\Application\SequenceGenerator;

final class SequenceGeneratorTest extends SettingsTestCase
{
    private function next(string $code): string
    {
        return $this->service(Connection::class)->transactional(
            fn (): string => $this->service(SequenceGenerator::class)->next($code),
        );
    }

    public function testIssuesConsecutiveNumbersInTheConfiguredFormat(): void
    {
        self::assertSame('COT-2610-0001', $this->next('quote'));
        self::assertSame('COT-2610-0002', $this->next('quote'));
        self::assertSame('CLI-0001', $this->next('client'));
        self::assertSame('CLI-0002', $this->next('client'));
        self::assertSame('PRY-2610-0001', $this->next('project'), 'Each sequence counts on its own.');
    }

    public function testRefusesToIssueOutsideATransactionAndForAnUnknownCode(): void
    {
        $generator = $this->service(SequenceGenerator::class);

        try {
            $generator->next('quote');
            self::fail('A number must be taken inside a transaction.');
        } catch (LogicException $failure) {
            self::assertStringContainsString('inside the transaction', $failure->getMessage());
        }

        $this->expectException(LogicException::class);
        $this->service(Connection::class)->transactional(fn () => $generator->next('nothing'));
    }

    public function testARolledBackTransactionGivesTheNumberBack(): void
    {
        self::assertSame('COT-2610-0001', $this->next('quote'));

        try {
            $this->service(Connection::class)->transactional(function (): void {
                self::assertSame('COT-2610-0002', $this->service(SequenceGenerator::class)->next('quote'));
                throw new RuntimeException('The document failed to save.');
            });
        } catch (RuntimeException) {
            // Expected: the number goes back with the rollback, so there is no gap.
        }

        self::assertSame('COT-2610-0002', $this->next('quote'));
    }

    public function testTheCounterStartsAgainWhenTheMonthChanges(): void
    {
        $this->next('quote');
        $this->next('quote');

        $this->clock->advance('+1 month');
        self::assertSame('COT-2611-0001', $this->next('quote'));
        self::assertSame('COT-2611-0002', $this->next('quote'));
    }

    public function testThePeriodFollowsTheCompanyCalendarNotUtc(): void
    {
        // 2026-11-01 03:00 UTC is still the evening of October 31 in Guatemala (UTC-6).
        $this->clock->advance('2026-11-01 03:00:00');
        self::assertSame('COT-2610-0001', $this->next('quote'));

        $this->connection->executeStatement("UPDATE company SET timezone = 'UTC'");
        self::assertSame('COT-2611-0001', $this->next('quote'), 'In UTC it is already November.');
    }

    public function testAnnualSequencesRestartEachYearAndFormatsNeverCutLongNumbers(): void
    {
        $this->connection->executeStatement(
            "UPDATE sequences SET period = 'year', padding = 2, next_value = 99 WHERE code = 'project'",
        );

        self::assertSame('PRY-2026-99', $this->next('project'));
        self::assertSame('PRY-2026-100', $this->next('project'));
        $this->clock->advance('+1 year');
        self::assertSame('PRY-2027-01', $this->next('project'));
    }
}
