<?php

declare(strict_types=1);

namespace Soltec\Kernel\Http;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;

/**
 * Builds RFC 9457 "problem details" error responses.
 *
 * "code" is a stable, machine-readable identifier in English; the web app maps it to the Spanish
 * message the user sees, so the API never carries user-facing text.
 */
final class ProblemResponder
{
    public function __construct(private readonly ResponseFactoryInterface $responses)
    {
    }

    /**
     * @param list<array{field: string, code: string}>|null $errors the wrong fields of a validation failure
     * @param array<string, int|string|bool> $extensions extra members (RFC 9457), such as a count the client shows
     */
    public function respond(
        int $status,
        string $code,
        string $title,
        ?string $detail = null,
        ?array $errors = null,
        array $extensions = [],
    ): ResponseInterface {
        $payload = ['type' => 'about:blank', 'title' => $title, 'status' => $status, 'code' => $code] + $extensions;
        if ($detail !== null) {
            $payload['detail'] = $detail;
        }
        if ($errors !== null) {
            $payload['errors'] = $errors;
        }

        return Json::write($this->responses->createResponse($status), $payload, $status, 'application/problem+json');
    }
}
