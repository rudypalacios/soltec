<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration;

use Soltec\Kernel\Bootstrap;

final class HealthEndpointTest extends IntegrationTestCase
{
    public function testReportsOkWhenTheDatabaseAnswers(): void
    {
        $response = $this->call('GET', '/api/v1/health');

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['status' => 'ok', 'checks' => ['database' => 'ok']], $this->json($response));
        self::assertSame('nosniff', $response->getHeaderLine('X-Content-Type-Options'));
        self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
    }

    public function testReportsDegradedWithoutLeakingDetailsWhenTheDatabaseIsDown(): void
    {
        $this->app = Bootstrap::createApp(dirname(__DIR__, 2), $this->configWith(['DB_PASS' => 'wrong-password']));

        $response = $this->call('GET', '/api/v1/health');

        self::assertSame(503, $response->getStatusCode());
        self::assertSame(['status' => 'degraded', 'checks' => ['database' => 'error']], $this->json($response));
    }

    public function testUnknownRoutesAnswerWithProblemDetails(): void
    {
        $response = $this->call('GET', '/api/v1/does-not-exist');

        self::assertSame(404, $response->getStatusCode());
        self::assertSame('application/problem+json', $response->getHeaderLine('Content-Type'));
        self::assertSame('not_found', $this->json($response)['code']);
        self::assertSame('nosniff', $response->getHeaderLine('X-Content-Type-Options'));
    }

    public function testWrongMethodsAnswerWithTheAllowedOnes(): void
    {
        $response = $this->call('POST', '/api/v1/health');

        self::assertSame(405, $response->getStatusCode());
        self::assertSame('GET', $response->getHeaderLine('Allow'));
    }
}
