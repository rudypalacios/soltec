<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration;

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
        self::assertSame(1, $body['count']);
        self::assertSame(['20261008000001 CreateScaffoldProbeTable'], $body['applied']);
        self::assertContains('scaffold_probe', $this->connection->fetchFirstColumn('SHOW TABLES'));

        $second = $this->json($this->call('POST', '/api/system/migrations/apply', $this->deployHeaders()));
        self::assertSame(0, $second['count']);
        self::assertSame([], $second['applied']);
    }

    public function testMigrationsAreRefusedWhileAnotherRunHoldsTheLock(): void
    {
        $other = \Soltec\Kernel\Db\ConnectionFactory::create($this->config);
        self::assertSame(1, (int) $other->fetchOne("SELECT GET_LOCK('soltec_migrations', 0)"));

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
        self::assertSame(PHP_VERSION, $body['php']['version'] ?? null);
        self::assertTrue($body['extensions']['pdo_mysql'] ?? false);
        self::assertTrue($body['database']['generated_column_unique']['supported'] ?? false);
        self::assertStringNotContainsString(self::DEPLOY_TOKEN, (string) $response->getBody());
        self::assertStringNotContainsString((string) getenv('DB_PASS'), (string) $response->getBody());
    }

    public function testDiagnosticsRequireTheDeployToken(): void
    {
        self::assertSame(401, $this->call('GET', '/api/system/diagnostics')->getStatusCode());
    }
}
