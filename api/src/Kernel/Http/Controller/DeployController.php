<?php

declare(strict_types=1);

namespace Soltec\Kernel\Http\Controller;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;
use Soltec\Kernel\Deploy\Diagnostics;
use Soltec\Kernel\Deploy\MigrationInProgressException;
use Soltec\Kernel\Deploy\MigrationRunner;
use Soltec\Kernel\Deploy\PostMigrationStep;
use Soltec\Kernel\Http\Json;
use Soltec\Kernel\Http\ProblemResponder;
use Throwable;

/** Deployment endpoints. They are not part of the versioned public API and need the deploy token. */
final class DeployController
{
    public function __construct(
        private readonly MigrationRunner $migrations,
        private readonly PostMigrationStep $postMigration,
        private readonly Diagnostics $diagnostics,
        private readonly ProblemResponder $problems,
        private readonly LoggerInterface $logger,
    ) {
    }

    /** POST /system/migrations/apply */
    public function applyMigrations(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        try {
            $applied = $this->migrations->apply();
        } catch (MigrationInProgressException $error) {
            return $this->problems->respond(
                409,
                'migration_in_progress',
                'Migration in progress',
                $error->getMessage(),
            );
        } catch (Throwable $error) {
            $this->logger->error('Migration failed.', ['exception' => $error]);

            // The endpoint is protected by the deploy token, so the message helps whoever deploys.
            return $this->problems->respond(500, 'migration_failed', 'Migration failed', $error->getMessage());
        }

        return Json::write($response, [
            'applied' => $applied,
            'count' => count($applied),
            'steps' => [$this->postMigration->name() => $this->runStep()],
        ]);
    }

    /** A failing step is reported, not fatal: the migrations are already applied and the site must keep deploying. */
    private function runStep(): string
    {
        try {
            return $this->postMigration->run();
        } catch (Throwable $error) {
            $this->logger->error('A post-migration step failed.', ['exception' => $error]);

            return 'failed';
        }
    }

    /** GET /system/diagnostics */
    public function diagnostics(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, $this->diagnostics->collect());
    }
}
