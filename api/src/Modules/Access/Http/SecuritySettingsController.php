<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Application\SecuritySettingsService;
use Soltec\Modules\Access\Domain\SecuritySettingsRecord;

/** /v1/settings/security */
final class SecuritySettingsController
{
    public function __construct(private readonly SecuritySettingsService $settings)
    {
    }

    public function show(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, $this->settings->get()->toApi());
    }

    public function update(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $version = $input->version();
        $values = [];
        foreach (SecuritySettingsRecord::LIMITS as $field => [$min, $max]) {
            $values[$field] = $input->integer($field, $min, $max);
        }
        $input->done();

        $settings = $this->settings->update(
            ActorContext::fromRequest($request),
            (int) $version,
            array_map(static fn (?int $value): int => (int) $value, $values),
        );

        return Json::write($response, $settings->toApi());
    }
}
