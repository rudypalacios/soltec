<?php

declare(strict_types=1);

namespace Soltec\Kernel\Http;

use Psr\Http\Message\ResponseInterface;

/** Writes JSON payloads to PSR-7 responses. */
final class Json
{
    /** @param array<array-key, mixed> $payload */
    public static function write(
        ResponseInterface $response,
        array $payload,
        int $status = 200,
        string $contentType = 'application/json',
    ): ResponseInterface {
        $response->getBody()->write(json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));

        return $response
            ->withStatus($status)
            ->withHeader('Content-Type', $contentType);
    }
}
