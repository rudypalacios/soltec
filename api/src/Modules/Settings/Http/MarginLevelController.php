<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Http\CurrentUserAware;
use Soltec\Modules\Settings\Application\MarginLevelService;
use Soltec\Modules\Settings\Domain\MarginLevelRecord;

/** /v1/margin-levels */
final class MarginLevelController
{
    use CurrentUserAware;

    public function __construct(private readonly MarginLevelService $levels)
    {
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $status = $query->choice('status', ['active', 'inactive', 'all'], 'active');
        $query->done();

        return Json::write($response, [
            'data' => array_map(
                static fn (MarginLevelRecord $level): array => $level->toApi(),
                $this->levels->list((string) $status),
            ),
        ]);
    }

    /**
     * The active levels with what a selector needs, by margin: open to any internal session (ADR-0024), so a price
     * list can offer them without access to this section.
     */
    public function options(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, [
            'data' => array_map(
                static fn (MarginLevelRecord $level): array => [
                    'id' => $level->id,
                    'name' => $level->name,
                    'rate' => $level->rate,
                    'is_default' => $level->isDefault,
                ],
                $this->levels->list('active'),
            ),
        ]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $name = $input->text('name', 1, 60);
        $rate = $input->rate('rate');
        $input->done();

        $level = $this->levels->create(ActorContext::fromRequest($request), (string) $name, (string) $rate);

        return Json::write($response, $level->toApi(), 201);
    }

    /** @param array<string, string> $args */
    public function show(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        return Json::write($response, $this->levels->get($this->pathId($args, 'marginLevelId'))->toApi());
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = $this->pathId($args, 'marginLevelId');
        $input = Input::body($request);
        $version = $input->version();
        $name = $input->text('name', 1, 60);
        $rate = $input->rate('rate');
        $input->done();

        $level = $this->levels->update(
            ActorContext::fromRequest($request),
            $id,
            (int) $version,
            (string) $name,
            (string) $rate,
        );

        return Json::write($response, $level->toApi());
    }

    /** @param array<string, string> $args */
    public function setDefault(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $level = $this->levels->setDefault(ActorContext::fromRequest($request), $this->pathId($args, 'marginLevelId'));

        return Json::write($response, $level->toApi());
    }

    /** @param array<string, string> $args */
    public function deactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $level = $this->levels->deactivate(ActorContext::fromRequest($request), $this->pathId($args, 'marginLevelId'));

        return Json::write($response, $level->toApi());
    }

    /** @param array<string, string> $args */
    public function reactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $level = $this->levels->reactivate(ActorContext::fromRequest($request), $this->pathId($args, 'marginLevelId'));

        return Json::write($response, $level->toApi());
    }
}
