<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Application\DeviceService;
use Soltec\Modules\Access\Domain\DeviceRecord;

/** /v1/me/devices */
final class DeviceController
{
    use CurrentUserAware;

    public function __construct(private readonly DeviceService $devices)
    {
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $records = $this->devices->list($this->caller($request));

        return Json::write($response, [
            'data' => array_map(static fn (DeviceRecord $device): array => $device->toApi(), $records),
        ]);
    }

    /** @param array<string, string> $args */
    public function revoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $this->devices->revoke(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $this->pathId($args, 'deviceId'),
        );

        return $response->withStatus(204);
    }
}
