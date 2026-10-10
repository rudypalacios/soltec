<?php

declare(strict_types=1);

namespace Soltec\Modules\Organization\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Http\CurrentUserAware;
use Soltec\Modules\Organization\Application\DepartmentService;
use Soltec\Modules\Organization\Domain\DepartmentRecord;

/** /v1/departments */
final class DepartmentController
{
    use CurrentUserAware;

    public function __construct(private readonly DepartmentService $departments)
    {
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $text = $query->nullableText('q', 100);
        $status = $query->choice('status', ['active', 'inactive', 'all'], 'active');
        $page = $query->pagination();
        $query->done();

        $result = $this->departments->list($text, (string) $status, $page);

        return Json::write($response, [
            'data' => array_map(
                static fn (DepartmentRecord $department): array => $department->toApi(),
                $result['records'],
            ),
            'meta' => $page->meta($result['total']),
        ]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $name = $input->text('name', 1, 100);
        $input->done();

        $department = $this->departments->create(ActorContext::fromRequest($request), (string) $name);

        return Json::write($response, $department->toApi(), 201);
    }

    /** @param array<string, string> $args */
    public function show(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        return Json::write($response, $this->departments->get($this->pathId($args, 'departmentId'))->toApi());
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = $this->pathId($args, 'departmentId');
        $input = Input::body($request);
        $version = $input->version();
        $name = $input->text('name', 1, 100);
        $input->done();

        $department = $this->departments->rename(
            ActorContext::fromRequest($request),
            $id,
            (int) $version,
            (string) $name,
        );

        return Json::write($response, $department->toApi());
    }

    /** @param array<string, string> $args */
    public function deactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $department = $this->departments->deactivate(
            ActorContext::fromRequest($request),
            $this->pathId($args, 'departmentId'),
        );

        return Json::write($response, $department->toApi());
    }

    /** @param array<string, string> $args */
    public function reactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $department = $this->departments->reactivate(
            ActorContext::fromRequest($request),
            $this->pathId($args, 'departmentId'),
        );

        return Json::write($response, $department->toApi());
    }
}
