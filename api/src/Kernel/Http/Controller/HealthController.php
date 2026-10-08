<?php

declare(strict_types=1);

namespace Soltec\Kernel\Http\Controller;

use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;
use Soltec\Kernel\Http\Json;
use Throwable;

/** GET /v1/health: tells whether the API and its database answer. It exposes no internal detail. */
final class HealthController
{
    public function __construct(
        private readonly Connection $connection,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $databaseIsUp = $this->databaseIsUp();

        return Json::write(
            $response,
            [
                'status' => $databaseIsUp ? 'ok' : 'degraded',
                'checks' => ['database' => $databaseIsUp ? 'ok' : 'error'],
            ],
            $databaseIsUp ? 200 : 503,
        );
    }

    private function databaseIsUp(): bool
    {
        try {
            $this->connection->executeQuery('SELECT 1');

            return true;
        } catch (Throwable $error) {
            $this->logger->error('Health check: the database is not reachable.', ['exception' => $error]);

            return false;
        }
    }
}
