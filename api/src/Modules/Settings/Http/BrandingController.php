<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Settings\Application\CompanyService;

/**
 * /v1/branding: the name and logo of the company, public because the sign-in screen shows them before anyone has a
 * session. It exposes nothing else of `company`.
 */
final class BrandingController
{
    public function __construct(private readonly CompanyService $company)
    {
    }

    public function show(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $company = $this->company->get();

        return Json::write($response, [
            'trade_name' => $company->tradeName,
            'logo_version' => $company->logoVersion(),
        ]);
    }

    /**
     * The image. Asked with `?v=` equal to the current version the content can never change (a new logo is a new
     * version, so a new URL) and the browser keeps it for good. Without it, or with an old version, the browser
     * revalidates by ETag and gets a 304 instead of the image again.
     */
    public function logo(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $logo = $this->company->logo() ?? throw ApiException::notFound();
        $etag = '"' . $logo['version'] . '"';

        $immutable = ($request->getQueryParams()['v'] ?? null) === $logo['version'];
        $response = $response
            ->withHeader('ETag', $etag)
            ->withHeader('Cache-Control', $immutable ? 'public, max-age=31536000, immutable' : 'public, no-cache');
        if ($request->getHeaderLine('If-None-Match') === $etag) {
            return $response->withStatus(304);
        }
        $response->getBody()->write($logo['content']);

        return $response->withHeader('Content-Type', 'image/webp');
    }
}
