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
 * Validates the bearer token of every route that is not `public` and leaves the CurrentUser in the request.
 * A route with no declared permission is a programming error and fails closed (a test also catches it).
 */
final class AuthenticationMiddleware implements MiddlewareInterface
{
    public const USER_ATTRIBUTE = 'current_user';
    public const PUBLIC = 'public';
    public const AUTHENTICATED = 'authenticated';
    /** Any session of an internal user: the options lists every form may read (ADR-0024). */
    public const INTERNAL = 'internal';

    public function __construct(private readonly JwtService $jwt, private readonly CurrentUserLoader $users)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $route = RouteContext::fromRequest($request)->getRoute() ?? throw new LogicException('No route matched.');
        $permission = $route->getArgument('permission');
        if (!is_string($permission) || $permission === '') {
            throw new LogicException('The route declares no permission.');
        }
        if ($permission === self::PUBLIC) {
            return $handler->handle($request);
        }

        $claims = $this->jwt->decode($this->bearerToken($request));
        $user = $this->users->load($claims) ?? throw ApiException::unauthorized('token_invalid');
        if ($user->restricted && $route->getArgument('restricted') !== 'allowed') {
            throw ApiException::forbidden('password_change_required');
        }

        return $handler->handle($request->withAttribute(self::USER_ATTRIBUTE, $user));
    }

    private function bearerToken(ServerRequestInterface $request): string
    {
        if (preg_match('/^Bearer\s+(\S+)$/i', $request->getHeaderLine('Authorization'), $match) !== 1) {
            throw ApiException::unauthorized('token_invalid');
        }

        return $match[1];
    }
}
