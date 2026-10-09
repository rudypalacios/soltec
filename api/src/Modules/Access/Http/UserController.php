<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Application\UserService;
use Soltec\Modules\Access\Domain\UserRecord;

/** /v1/users */
final class UserController
{
    use CurrentUserAware;

    public function __construct(private readonly UserService $users, private readonly Clock $clock)
    {
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $text = $query->nullableText('q', 100);
        $status = $query->choice('status', ['active', 'inactive', 'all'], 'active');
        $type = $query->choice('type', ['internal', 'external'], '');
        $roleParam = $request->getQueryParams()['role_id'] ?? null;
        if ($roleParam !== null && (!is_string($roleParam) || !Uuid::isValid($roleParam))) {
            $query->fail('role_id', 'invalid');
        }
        $page = $query->pagination();
        $query->done();

        $result = $this->users->list(
            $this->caller($request),
            $text,
            (string) $status,
            $type === '' ? null : $type,
            is_string($roleParam) ? $roleParam : null,
            $page,
        );

        return Json::write($response, [
            'data' => array_map($this->present(...), $result['records']),
            'meta' => $page->meta($result['total']),
        ]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $name = $input->text('name', 1, 150);
        $email = $input->email('email');
        $roleIds = $input->uuidList('role_ids');
        $password = $input->secret('initial_password');
        $input->done();

        $user = $this->users->create(
            $this->caller($request),
            ActorContext::fromRequest($request),
            (string) $name,
            (string) $email,
            $roleIds ?? [],
            (string) $password,
        );

        return Json::write($response, $this->present($user), 201);
    }

    /** @param array<string, string> $args */
    public function show(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->users->get($this->caller($request), $this->pathId($args, 'userId'));

        return Json::write($response, $this->present($user));
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = $this->pathId($args, 'userId');
        $input = Input::body($request);
        $version = $input->version();
        $name = $input->has('name') ? $input->text('name', 1, 150) : null;
        $email = $input->has('email') ? $input->email('email') : null;
        $roleIds = $input->has('role_ids') ? $input->uuidList('role_ids') : null;
        $input->done();

        $user = $this->users->update(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $id,
            (int) $version,
            $name,
            $email,
            $roleIds,
        );

        return Json::write($response, $this->present($user));
    }

    /** @param array<string, string> $args */
    public function deactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $user = $this->users->deactivate(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $this->pathId($args, 'userId'),
        );

        return Json::write($response, $this->present($user));
    }

    /** @param array<string, string> $args */
    public function reactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $user = $this->users->reactivate(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $this->pathId($args, 'userId'),
        );

        return Json::write($response, $this->present($user));
    }

    /** @return array<string, mixed> */
    private function present(UserRecord $user): array
    {
        return $user->toApi($this->clock->now());
    }
}
