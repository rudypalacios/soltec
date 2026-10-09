<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Config;

/**
 * The web keeps the refresh token in an httpOnly cookie that only travels to the auth routes, so scripts never
 * read it. SameSite=Strict plus a JSON-only API covers CSRF (docs/arquitectura/autenticacion-y-roles.md, 4).
 */
final class RefreshCookie
{
    public const NAME = 'refresh_token';

    public function __construct(private readonly Config $config)
    {
    }

    public function read(ServerRequestInterface $request): ?string
    {
        $value = $request->getCookieParams()[self::NAME] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }

    public function set(ResponseInterface $response, string $token, int $maxAgeSeconds): ResponseInterface
    {
        return $response->withAddedHeader('Set-Cookie', $this->format($token, $maxAgeSeconds));
    }

    public function clear(ResponseInterface $response): ResponseInterface
    {
        return $response->withAddedHeader('Set-Cookie', $this->format('', 0));
    }

    private function format(string $value, int $maxAgeSeconds): string
    {
        return sprintf(
            '%s=%s; Max-Age=%d; Path=%s/v1/auth; HttpOnly; Secure; SameSite=Strict',
            self::NAME,
            $value,
            $maxAgeSeconds,
            rtrim($this->config->string('APP_BASE_PATH', '/api'), '/'),
        );
    }
}
