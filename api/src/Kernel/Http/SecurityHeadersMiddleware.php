<?php

declare(strict_types=1);

namespace Soltec\Kernel\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/** Adds the security headers every API response carries. HSTS is set by the web server. */
final class SecurityHeadersMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        return $handler->handle($request)
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Referrer-Policy', 'no-referrer')
            ->withHeader('Cache-Control', 'no-store');
    }
}
