<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Soltec\Modules\Access\Deploy\AccessRequirements;

final class AccessRequirementsTest extends AccessTestCase
{
    public function testAWarningTellsHowToCreateTheFirstAdministratorWhenThereIsNone(): void
    {
        $checks = $this->service(AccessRequirements::class)->checks();

        self::assertCount(1, $checks);
        $check = $checks[0]->toArray();
        self::assertSame('access.first_admin', $check['id']);
        self::assertSame('warn', $check['status']);
        self::assertStringContainsString('user:create-admin', (string) $check['hint']);
    }

    public function testPassesOnceAnActiveAdministratorExists(): void
    {
        $this->createAdmin();

        self::assertSame('pass', $this->service(AccessRequirements::class)->checks()[0]->toArray()['status']);
    }

    public function testWarnsWhileTheAdminPasswordIsStillInTheEnv(): void
    {
        $this->createAdmin();

        $checks = (new AccessRequirements($this->configWith(['ADMIN_PASSWORD' => 'x'])))->checks();

        self::assertSame(['access.first_admin', 'access.admin_password_in_env'], array_map(
            static fn ($check): string => $check->toArray()['id'],
            $checks,
        ));
        self::assertSame('warn', $checks[1]->toArray()['status']);
    }

    public function testDoesNotMentionTheAdminPasswordWhenThereIsNone(): void
    {
        $this->createAdmin();

        self::assertCount(1, (new AccessRequirements($this->configWith([])))->checks());
    }

    public function testADeactivatedAdministratorDoesNotCount(): void
    {
        $this->createAdmin();
        $this->connection->executeStatement('UPDATE users SET deleted_at = NOW(3)');

        self::assertSame('warn', $this->service(AccessRequirements::class)->checks()[0]->toArray()['status']);
    }

    public function testIsSilentBeforeTheMigrationsHaveRun(): void
    {
        $this->resetDatabase();

        self::assertSame([], $this->service(AccessRequirements::class)->checks());
    }

    public function testTheRequirementsEndpointIncludesIt(): void
    {
        $body = $this->json($this->call('GET', '/api/system/requirements'));

        $ids = array_column($this->rowsAt($body, 'checks'), 'id');
        self::assertContains('access.first_admin', $ids);
        self::assertContains('config.jwt_secret', $ids);
        self::assertContains('config.app_url', $ids);
    }
}
