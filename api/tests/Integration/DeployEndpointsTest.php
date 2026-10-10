<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration;

use Soltec\Kernel\Bootstrap;

final class DeployEndpointsTest extends IntegrationTestCase
{
    public function testMigrationsRequireTheDeployToken(): void
    {
        self::assertSame(401, $this->call('POST', '/api/system/migrations/apply')->getStatusCode());
        self::assertSame(
            401,
            $this->call('POST', '/api/system/migrations/apply', ['X-Deploy-Token' => 'wrong'])->getStatusCode(),
        );
    }

    public function testMigrationsAreAppliedOnceAndTheSecondRunDoesNothing(): void
    {
        $first = $this->call('POST', '/api/system/migrations/apply', $this->deployHeaders());

        self::assertSame(200, $first->getStatusCode());
        $body = $this->json($first);
        $files = glob(dirname(__DIR__, 3) . '/db/migrations/*.php') ?: [];
        self::assertSame(count($files), $body['count']);
        self::assertSame('20261008000001 CreateScaffoldProbeTable', $this->valueAt($body, 'applied', '0'));
        self::assertContains('scaffold_probe', $this->connection->fetchFirstColumn('SHOW TABLES'));

        $second = $this->json($this->call('POST', '/api/system/migrations/apply', $this->deployHeaders()));
        self::assertSame(0, $second['count']);
        self::assertSame([], $second['applied']);
    }

    public function testNoAdministratorIsCreatedWithoutAdminSettings(): void
    {
        $body = $this->json($this->call('POST', '/api/system/migrations/apply', $this->deployHeaders()));

        self::assertSame(['first_admin' => 'not_configured'], $body['steps']);
        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM users'));
    }

    public function testTheFirstAdministratorIsCreatedFromTheEnvAndOnlyOnce(): void
    {
        $password = 'a long deployment passphrase';
        $this->app = Bootstrap::createApp(dirname(__DIR__, 2), $this->configWith([
            'ADMIN_EMAIL' => 'Boss@Example.com',
            'ADMIN_PASSWORD' => $password,
            'ADMIN_NAME' => 'The Boss',
        ]));

        $first = $this->call('POST', '/api/system/migrations/apply', $this->deployHeaders());
        $second = $this->call('POST', '/api/system/migrations/apply', $this->deployHeaders());

        self::assertSame(['first_admin' => 'created'], $this->json($first)['steps']);
        self::assertSame(['first_admin' => 'exists'], $this->json($second)['steps']);
        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM users'));
        self::assertStringNotContainsString($password, (string) $first->getBody());
        $login = $this->call('POST', '/api/v1/auth/login', ['Content-Type' => 'application/json'], json_encode([
            'email' => 'boss@example.com',
            'password' => $password,
            'device' => ['platform' => 'web'],
        ], JSON_THROW_ON_ERROR));
        self::assertSame(200, $login->getStatusCode());
        self::assertFalse($this->json($login)['password_change_required']);
    }

    public function testMigrationsAreRefusedWhileAnotherRunHoldsTheLock(): void
    {
        $other = \Soltec\Kernel\Db\ConnectionFactory::create($this->config);
        self::assertContains($other->fetchOne("SELECT GET_LOCK('soltec_migrations', 0)"), [1, '1']);

        $response = $this->call('POST', '/api/system/migrations/apply', $this->deployHeaders());

        self::assertSame(409, $response->getStatusCode());
        self::assertSame('migration_in_progress', $this->json($response)['code']);
        self::assertNotContains('scaffold_probe', $this->connection->fetchFirstColumn('SHOW TABLES'));
    }

    public function testDiagnosticsReportTheServerCapabilitiesWithoutSecrets(): void
    {
        $response = $this->call('GET', '/api/system/diagnostics', $this->deployHeaders());

        self::assertSame(200, $response->getStatusCode());
        $body = $this->json($response);
        self::assertSame(PHP_VERSION, $this->valueAt($body, 'php', 'version'));
        self::assertTrue($this->valueAt($body, 'extensions', 'pdo_mysql'));
        self::assertTrue($this->valueAt($body, 'database', 'generated_column_unique', 'supported'));
        self::assertStringNotContainsString(self::DEPLOY_TOKEN, (string) $response->getBody());
        self::assertStringNotContainsString((string) getenv('DB_PASS'), (string) $response->getBody());
    }

    public function testDiagnosticsRequireTheDeployToken(): void
    {
        self::assertSame(401, $this->call('GET', '/api/system/diagnostics')->getStatusCode());
    }

    public function testMailTestRequiresTheDeployToken(): void
    {
        self::assertSame(401, $this->call('POST', '/api/system/mail/test')->getStatusCode());
    }

    public function testMailTestExplainsWhatIsMissingWhenMailIsNotConfigured(): void
    {
        $response = $this->call('POST', '/api/system/mail/test', $this->deployHeaders() + [
            'Content-Type' => 'application/json',
        ], '{"to":"person@example.com"}');

        self::assertSame(503, $response->getStatusCode());
        self::assertSame('mail_not_configured', $this->json($response)['code']);
    }

    public function testRequirementsAreOpenButAskSearchEnginesToStayAway(): void
    {
        $response = $this->call('GET', '/api/system/requirements');

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('noindex, nofollow', $response->getHeaderLine('X-Robots-Tag'));
    }

    public function testRequirementsReportTheDatabaseChecksAndLeaveNoProbeTableBehind(): void
    {
        $response = $this->call('GET', '/api/system/requirements');

        self::assertSame(200, $response->getStatusCode());
        $body = $this->json($response);
        self::assertContains($body['status'], ['ready', 'ready_with_warnings', 'blocked']);

        $statuses = $this->statusesById($body);
        foreach (['db.connection', 'db.version', 'db.generated_column', 'db.privileges'] as $id) {
            self::assertSame('pass', $statuses[$id] ?? null, $id);
        }
        self::assertNotContains('soltec_requirements_probe', $this->connection->fetchFirstColumn('SHOW TABLES'));
        self::assertStringNotContainsString((string) getenv('DB_PASS'), (string) $response->getBody());
    }

    public function testRequirementsExplainADatabaseThatCannotBeReached(): void
    {
        $this->app = \Soltec\Kernel\Bootstrap::createApp(
            dirname(__DIR__, 2),
            $this->configWith(['DB_PASS' => 'definitely-the-wrong-password']),
        );

        $body = $this->json($this->call('GET', '/api/system/requirements'));

        self::assertSame('blocked', $body['status']);
        $statuses = $this->statusesById($body);
        self::assertSame('fail', $statuses['db.connection'] ?? null);
        self::assertArrayNotHasKey('db.privileges', $statuses);
    }

    /**
     * @param array<string, mixed> $report
     * @return array<string, mixed> the status of every check, keyed by its id
     */
    private function statusesById(array $report): array
    {
        $checks = $report['checks'] ?? null;
        self::assertIsArray($checks);

        $statuses = [];
        foreach ($checks as $check) {
            self::assertIsArray($check);
            $id = $check['id'] ?? null;
            self::assertIsString($id);
            $statuses[$id] = $check['status'] ?? null;
        }

        return $statuses;
    }
}
