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
 * joined with `|` when any one is enough (the options lists of ADR-0024: who may administer a section or edit one that
 * consumes it).
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
