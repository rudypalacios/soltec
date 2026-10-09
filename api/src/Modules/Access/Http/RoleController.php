<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Application\RoleService;

/** /v1/roles */
final class RoleController
{
    use CurrentUserAware;

    public function __construct(private readonly RoleService $roles)
    {
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $text = $query->nullableText('q', 100);
        $status = $query->choice('status', ['active', 'inactive', 'all'], 'active');
        $userType = $query->choice('user_type', ['internal', 'external'], '');
        $page = $query->pagination();
        $query->done();

        $result = $this->roles->list($text, (string) $status, $userType === '' ? null : $userType, $page);

        return Json::write($response, [
            'data' => array_map(static fn ($role): array => $role->toApi(), $result['records']),
            'meta' => $page->meta($result['total']),
        ]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $name = $input->text('name', 1, 100);
        $description = $input->nullableText('description', 255);
        $userType = $input->choice('user_type', ['internal', 'external']);
        $permissions = $input->object('permissions');
        $scopes = $input->object('scopes');
        $input->done();

        $role = $this->roles->create(
            ActorContext::fromRequest($request),
            (string) $name,
            $description,
            (string) $userType,
            $permissions ?? [],
            $scopes ?? [],
        );

        return Json::write($response, $role->toApi(), 201);
    }

    /** @param array<string, string> $args */
    public function show(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        return Json::write($response, $this->roles->get($this->pathId($args, 'roleId'))->toApi());
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = $this->pathId($args, 'roleId');
        $input = Input::body($request);
        $version = $input->version();
        $name = $input->has('name') ? $input->text('name', 1, 100) : null;
        $description = $input->nullableText('description', 255);
        $permissions = $input->has('permissions') ? $input->object('permissions') : null;
        $scopes = $input->has('scopes') ? $input->object('scopes') : null;
        $input->done();

        $role = $this->roles->update(
            ActorContext::fromRequest($request),
            $id,
            (int) $version,
            $name,
            $description,
            $input->has('description'),
            $permissions,
            $scopes,
        );

        return Json::write($response, $role->toApi());
    }

    /** @param array<string, string> $args */
    public function deactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $role = $this->roles->deactivate(ActorContext::fromRequest($request), $this->pathId($args, 'roleId'));

        return Json::write($response, $role->toApi());
    }

    /** @param array<string, string> $args */
    public function reactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $role = $this->roles->reactivate(ActorContext::fromRequest($request), $this->pathId($args, 'roleId'));

        return Json::write($response, $role->toApi());
    }
}
