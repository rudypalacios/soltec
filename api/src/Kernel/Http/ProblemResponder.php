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

    public function respond(int $status, string $code, string $title, ?string $detail = null): ResponseInterface
    {
        $payload = ['type' => 'about:blank', 'title' => $title, 'status' => $status, 'code' => $code];
        if ($detail !== null) {
            $payload['detail'] = $detail;
        }

        return Json::write($this->responses->createResponse($status), $payload, $status, 'application/problem+json');
    }
}
