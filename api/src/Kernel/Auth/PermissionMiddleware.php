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

/**
 * Checks the permission a route declares. Denies by default. The rule is `<resource>.<action>`, or several of them
 * joined with `|` when any one is enough, or one of the markers `public`, `authenticated` and `internal` (a session of
 * an internal user, which the options lists of ADR-0024 use: no external client reads the company's lists).
 */
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
        if ($permission === AuthenticationMiddleware::INTERNAL) {
            if ($user instanceof CurrentUser && $user->type === 'internal') {
                return $handler->handle($request);
            }

            throw ApiException::forbidden();
        }
        if ($user instanceof CurrentUser) {
            foreach (explode('|', $permission) as $alternative) {
                [$resource, $action] = array_pad(explode('.', $alternative, 2), 2, '');
                if ($user->can($resource, $action)) {
                    return $handler->handle($request);
                }
            }
        }

        throw ApiException::forbidden();
    }
}
