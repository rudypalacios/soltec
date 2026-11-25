<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Notifications;

use Soltec\Kernel\Deploy\Requirements\CheckStatus;
use Soltec\Kernel\Deploy\Requirements\RequirementCheck;
use Soltec\Modules\Notifications\Deploy\NotificationsRequirements;
use Soltec\Tests\Integration\Access\AccessTestCase;

final class NotificationsRequirementsTest extends AccessTestCase
{
    public function testWarnsWhenTheHourlyJobNeverRan(): void
    {
        $check = $this->check();

        self::assertSame(CheckStatus::Warn, $check->status);
        self::assertStringContainsString('notifications:run', (string) $check->hint);
    }

    public function testPassesWhenItRanRecentlyAndWarnsWhenItStopped(): void
    {
        $this->connection->executeStatement('UPDATE notification_settings SET last_run_at = UTC_TIMESTAMP(3)');
        self::assertSame(CheckStatus::Pass, $this->check()->status);

        $this->connection->executeStatement(
            'UPDATE notification_settings SET last_run_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 3 HOUR)',
        );
        $stale = $this->check();
        self::assertSame(CheckStatus::Warn, $stale->status);
        self::assertStringContainsString('3 hours ago', $stale->message);
    }

    public function testIsSilentBeforeTheMigrationsHaveRun(): void
    {
        $this->resetDatabase();

        self::assertSame([], $this->service(NotificationsRequirements::class)->checks());
    }

    public function testTheRequirementsEndpointIncludesIt(): void
    {
        $body = $this->json($this->call('GET', '/api/system/requirements'));

        self::assertContains('notifications.cron', array_column($this->rowsAt($body, 'checks'), 'id'));
    }

    private function check(): RequirementCheck
    {
        $checks = $this->service(NotificationsRequirements::class)->checks();
        self::assertCount(1, $checks);

        return $checks[0];
    }
}
