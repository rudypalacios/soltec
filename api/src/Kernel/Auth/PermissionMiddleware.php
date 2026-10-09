<?php

declare(strict_types=1);

namespace Soltec\Kernel\Auth;

use LogicException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Routing\RouteContext;
use Soltec\Kernel\Http\ApiException;

/** Checks the `<resource>.<action>` permission a route declares. Denies by default. */
final class PermissionMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $route = RouteContext::fromRequest($request)->getRoute() ?? throw new LogicException('No route matched.');
        $permission = $route->getArgument('permission');
        if (!is_string($permission) || $permission === '') {
            throw new LogicException('The route declares no permission.');
        }
        if (in_array($permission, [AuthenticationMiddleware::PUBLIC, AuthenticationMiddleware::AUTHENTICATED], true)) {
            return $handler->handle($request);
        }

        $user = $request->getAttribute(AuthenticationMiddleware::USER_ATTRIBUTE);
        [$resource, $action] = array_pad(explode('.', $permission, 2), 2, '');
        if (!$user instanceof CurrentUser || !$user->can($resource, $action)) {
            throw ApiException::forbidden();
        }

        return $handler->handle($request);
    }
}
