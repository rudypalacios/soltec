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

    /** The image, with an ETag so the browser revalidates for a 304 instead of downloading it again. */
    public function logo(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $logo = $this->company->logo() ?? throw ApiException::notFound();
        $etag = '"' . $logo['version'] . '"';

        $response = $response
            ->withHeader('ETag', $etag)
            ->withHeader('Cache-Control', 'public, no-cache');
        if ($request->getHeaderLine('If-None-Match') === $etag) {
            return $response->withStatus(304);
        }
        $response->getBody()->write($logo['content']);

        return $response->withHeader('Content-Type', 'image/webp');
    }
}
