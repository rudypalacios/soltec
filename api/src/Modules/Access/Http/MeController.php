<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Auth\AuthenticationMiddleware;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\Json;

/** GET /v1/me */
final class MeController
{
    public function show(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $request->getAttribute(AuthenticationMiddleware::USER_ATTRIBUTE);
        if (!$user instanceof CurrentUser) {
            throw ApiException::unauthorized('token_invalid');
        }

        return Json::write($response, MePresenter::toArray($user));
    }
}
