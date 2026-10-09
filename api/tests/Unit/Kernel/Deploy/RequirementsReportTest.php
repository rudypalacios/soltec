<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel\Deploy;

use PHPUnit\Framework\TestCase;
use Soltec\Kernel\Deploy\Requirements\CheckStatus;
use Soltec\Kernel\Deploy\Requirements\RequirementCheck;
use Soltec\Kernel\Deploy\Requirements\RequirementsReport;

final class RequirementsReportTest extends TestCase
{
    public function testIsReadyWhenEverythingPasses(): void
    {
        $report = new RequirementsReport([RequirementCheck::pass('a', 'g', 'ok')]);

        self::assertSame('ready', $report->status());
        self::assertSame(['pass' => 1, 'warn' => 0, 'fail' => 0], $report->toArray()['summary']);
    }

    public function testWarningsDoNotBlock(): void
    {
        $report = new RequirementsReport([
            RequirementCheck::pass('a', 'g', 'ok'),
            new RequirementCheck('b', 'g', CheckStatus::Warn, 'meh', 'do something'),
        ]);

        self::assertSame('ready_with_warnings', $report->status());
    }

    public function testOneFailureBlocksEvenWithWarnings(): void
    {
        $report = new RequirementsReport([
            new RequirementCheck('b', 'g', CheckStatus::Warn, 'meh'),
            new RequirementCheck('c', 'g', CheckStatus::Fail, 'broken', 'fix it'),
        ]);

        $array = $report->toArray();

        self::assertSame('blocked', $array['status']);
        self::assertSame(['pass' => 0, 'warn' => 1, 'fail' => 1], $array['summary']);
        self::assertSame(
            ['id' => 'c', 'group' => 'g', 'status' => 'fail', 'message' => 'broken', 'hint' => 'fix it'],
            $array['checks'][1],
        );
    }
}
