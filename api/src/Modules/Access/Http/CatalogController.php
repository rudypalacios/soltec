<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Persistence\RoleRepository;

/** GET /v1/resources and /v1/permissions: the read-only lists the permission matrix is built from. */
final class CatalogController
{
    public function __construct(private readonly RoleRepository $roles)
    {
    }

    public function resources(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, ['data' => $this->roles->resources()]);
    }

    public function permissions(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, ['data' => $this->roles->permissions()]);
    }
}
