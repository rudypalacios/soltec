<?php

declare(strict_types=1);

use Slim\App;
use Slim\Routing\RouteCollectorProxy;
use Soltec\Kernel\Http\Controller\DeployController;
use Soltec\Kernel\Http\Controller\HealthController;
use Soltec\Kernel\Http\Controller\MailTestController;
use Soltec\Kernel\Http\Controller\RequirementsController;
use Soltec\Kernel\Http\DeployTokenMiddleware;

// Route table. Versioned public routes live under /v1 and must be described in contract/openapi.yaml.
// Deployment routes live under /system, are not versioned and are protected by the deploy token.
// Group callables are not static: Slim binds them to the container.
return static function (App $app): void {
    $app->group('/v1', function (RouteCollectorProxy $group): void {
        $group->get('/health', HealthController::class);
    });

    // Open on purpose while the project starts (decision of the user): it is only reachable by URL, it is not in
    // the contract and it asks crawlers to stay away. TODO.md lists protecting it before real data arrives.
    $app->get('/system/requirements', [RequirementsController::class, 'check']);

    $app->group('/system', function (RouteCollectorProxy $group): void {
        $group->post('/migrations/apply', [DeployController::class, 'applyMigrations']);
        $group->get('/diagnostics', [DeployController::class, 'diagnostics']);
        $group->post('/mail/test', [MailTestController::class, 'send']);
    })->add(DeployTokenMiddleware::class);
};
