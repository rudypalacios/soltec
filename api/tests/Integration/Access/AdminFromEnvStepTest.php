<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Soltec\Modules\Access\Application\AdminBootstrap;
use Soltec\Modules\Access\Deploy\AdminFromEnvStep;

final class AdminFromEnvStepTest extends AccessTestCase
{
    public function testDoesNothingWithoutSettings(): void
    {
        self::assertSame('not_configured', $this->deploy([]));
        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM users'));
    }

    public function testAnIncompletePairIsReportedAndCreatesNothing(): void
    {
        self::assertSame('incomplete', $this->deploy(['ADMIN_EMAIL' => 'boss@example.com']));
        self::assertSame('incomplete', $this->deploy(['ADMIN_PASSWORD' => self::PASSWORD]));
        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM users'));
    }

    public function testCreatesTheAdministratorWhoCanSignInAndRecordsItsSource(): void
    {
        $status = $this->deploy(['ADMIN_EMAIL' => ' Boss@Example.com ', 'ADMIN_PASSWORD' => self::PASSWORD]);

        self::assertSame('created', $status);
        $entries = $this->auditEntries('users');
        $login = $this->login('boss@example.com');
        self::assertSame(200, $login->getStatusCode());
        self::assertFalse($this->json($login)['password_change_required']);
        self::assertCount(1, $entries);
        self::assertSame('deploy', $entries[0]['after']['source'] ?? null);
        self::assertSame('Administrador', $entries[0]['after']['name'] ?? null);
        self::assertStringNotContainsString(self::PASSWORD, (string) json_encode($entries));
    }

    public function testUsesTheConfiguredName(): void
    {
        $this->deploy([
            'ADMIN_EMAIL' => 'boss@example.com',
            'ADMIN_PASSWORD' => self::PASSWORD,
            'ADMIN_NAME' => 'The Boss',
        ]);

        self::assertSame('The Boss', $this->connection->fetchOne('SELECT name FROM users'));
    }

    public function testRunningAgainWhenAnAdministratorExistsChangesNothing(): void
    {
        $settings = ['ADMIN_EMAIL' => 'boss@example.com', 'ADMIN_PASSWORD' => self::PASSWORD];
        $this->deploy($settings);

        self::assertSame('exists', $this->deploy($settings));
        self::assertSame('exists', $this->deploy(['ADMIN_EMAIL' => 'other@example.com'] + $settings));
        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM users'));
    }

    public function testAnotherAdministratorBlocksIt(): void
    {
        $this->createAdmin();

        self::assertSame(
            'exists',
            $this->deploy(['ADMIN_EMAIL' => 'boss@example.com', 'ADMIN_PASSWORD' => self::PASSWORD]),
        );
        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM users'));
    }

    public function testRejectsWhatTheConsoleWouldReject(): void
    {
        $cases = [
            'invalid_email' => ['not-an-email', self::PASSWORD],
            'password_too_short' => ['boss@example.com', 'short'],
            'password_invalid' => ['boss.person@example.com', 'boss.person@example.com'],
        ];

        foreach ($cases as $expected => [$email, $password]) {
            self::assertSame($expected, $this->deploy(['ADMIN_EMAIL' => $email, 'ADMIN_PASSWORD' => $password]));
        }
        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM users'));
    }

    public function testRejectsANameTooLong(): void
    {
        $status = $this->deploy([
            'ADMIN_EMAIL' => 'boss@example.com',
            'ADMIN_PASSWORD' => self::PASSWORD,
            'ADMIN_NAME' => str_repeat('n', 151),
        ]);

        self::assertSame('name_too_long', $status);
    }

    /** @param array<string, string> $settings */
    private function deploy(array $settings): string
    {
        $step = new AdminFromEnvStep($this->configWith($settings), $this->service(AdminBootstrap::class));

        return $step->run();
    }
}
