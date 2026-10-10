<?php

declare(strict_types=1);

namespace Soltec\Kernel\Http;

use RuntimeException;

/**
 * A failure the API reports on purpose: it becomes a problem-details response with a stable `code`.
 * Anything else that escapes is an unexpected error and answers 500.
 */
class ApiException extends RuntimeException
{
    /** @param array<string, int|string|bool> $extensions extra members of the problem body a client can act on */
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        public readonly string $title,
        public readonly ?string $detail = null,
        public readonly array $extensions = [],
    ) {
        parent::__construct($detail ?? $title, $status);
    }

    public static function unauthorized(string $code): self
    {
        return new self(401, $code, 'Unauthorized');
    }

    public static function forbidden(string $code = 'forbidden', ?string $detail = null): self
    {
        return new self(403, $code, 'Forbidden', $detail);
    }

    public static function notFound(): self
    {
        return new self(404, 'not_found', 'Not found');
    }

    /** @param array<string, int|string|bool> $extensions */
    public static function conflict(string $code = 'conflict', ?string $detail = null, array $extensions = []): self
    {
        return new self(409, $code, 'Conflict', $detail, $extensions);
    }

    public static function notConfigured(string $what): self
    {
        return new self(503, 'auth_not_configured', 'Service unavailable', $what);
    }
}
