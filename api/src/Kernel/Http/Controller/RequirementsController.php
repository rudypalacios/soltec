<?php

declare(strict_types=1);

namespace Soltec\Kernel\Http\Controller;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Deploy\Requirements\Requirements;
use Soltec\Kernel\Http\Json;

/** Pre-flight checklist for a new instance. Open (no token) and kept out of search engines; see routes.php. */
final class RequirementsController
{
    public function __construct(private readonly Requirements $requirements)
    {
    }

    /** GET /system/requirements. Always 200: the verdict is in the body ("status"). */
    public function check(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $server = $request->getServerParams();
        $documentRoot = is_string($server['DOCUMENT_ROOT'] ?? null) ? $server['DOCUMENT_ROOT'] : '';
        $forwarded = strtolower($request->getHeaderLine('X-Forwarded-Proto'));
        $isHttps = $request->getUri()->getScheme() === 'https' || $forwarded === 'https';

        return Json::write($response, $this->requirements->evaluate($documentRoot, $isHttps)->toArray())
            ->withHeader('X-Robots-Tag', 'noindex, nofollow');
    }
}
