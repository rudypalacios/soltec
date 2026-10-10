<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Http;

use DateTimeZone;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\BodyReader;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Settings\Application\CompanyService;
use Soltec\Modules\Settings\Application\LogoImage;

/** /v1/settings/company */
final class CompanyController
{
    public function __construct(private readonly CompanyService $company)
    {
    }

    public function show(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, $this->company->get()->toApi());
    }

    public function update(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $version = $input->version();
        $legalName = $input->text('legal_name', 1, 190);
        $tradeName = $input->text('trade_name', 1, 190);
        $taxId = $input->text('tax_id', 1, 30);
        $address = $input->nullableText('address', 255);
        $phone = $input->nullableText('phone', 40);
        $email = $input->nullableText('email', 190);
        if ($email !== null && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            $input->fail('email', 'invalid');
        }
        $timezone = $input->choice('timezone', DateTimeZone::listIdentifiers());
        $input->done();

        $company = $this->company->update(
            ActorContext::fromRequest($request),
            (int) $version,
            (string) $legalName,
            (string) $tradeName,
            (string) $taxId,
            $address,
            $phone,
            $email === null ? null : mb_strtolower($email),
            (string) $timezone,
        );

        return Json::write($response, $company->toApi());
    }

    /**
     * The image is the request body itself (not a multipart form): there is only one file and no other field, so the
     * simplest contract is the best one. Its type is read from its content, whatever the client says it is.
     */
    public function uploadLogo(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body = $request->getBody();
        // Look at the size before reading, so an oversized upload is not loaded into memory.
        if (($body->getSize() ?? 0) > LogoImage::MAX_BYTES) {
            throw ValidationException::field('logo', 'too_large');
        }
        $upload = BodyReader::read($body, LogoImage::MAX_BYTES);
        $company = $this->company->setLogo(ActorContext::fromRequest($request), $upload);

        return Json::write($response, $company->toApi());
    }

    public function deleteLogo(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, $this->company->removeLogo(ActorContext::fromRequest($request))->toApi());
    }
}
