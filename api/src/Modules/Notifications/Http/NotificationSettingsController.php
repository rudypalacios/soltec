<?php

declare(strict_types=1);

namespace Soltec\Modules\Notifications\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Notifications\Application\NotificationSettingsService;

/** /v1/settings/notifications */
final class NotificationSettingsController
{
    public function __construct(private readonly NotificationSettingsService $settings)
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
        $hour = $input->integer('due_reminder_hour', 0, 23);
        $input->done();

        $settings = $this->settings->update(ActorContext::fromRequest($request), (int) $version, (int) $hour);

        return Json::write($response, $settings->toApi());
    }
}
