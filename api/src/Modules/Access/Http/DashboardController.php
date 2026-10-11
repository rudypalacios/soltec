<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\RoleService;
use Soltec\Modules\Access\Domain\WidgetCatalog;

/** GET /v1/dashboard and GET /v1/widgets */
final class DashboardController
{
    use CurrentUserAware;

    public function __construct(private readonly RoleService $roles)
    {
    }

    public function show(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $codes = $this->roles->dashboardFor($this->caller($request));

        return Json::write($response, [
            'data' => array_map(static fn (string $code): array => ['code' => $code], $codes),
        ]);
    }

    public function catalog(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, ['data' => WidgetCatalog::all()]);
    }
}
