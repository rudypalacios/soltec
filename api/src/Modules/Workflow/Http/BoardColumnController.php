<?php

declare(strict_types=1);

namespace Soltec\Modules\Workflow\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Workflow\Application\BoardColumnService;
use Soltec\Modules\Workflow\Domain\BoardColumnRecord;
use Soltec\Modules\Workflow\Domain\WorkflowCode;

/** /v1/workflows/{workflow}/board-columns */
final class BoardColumnController
{
    private const MAX_COLUMNS = 30;

    public function __construct(private readonly BoardColumnService $columns)
    {
    }

    /** @param array<string, string> $args */
    public function list(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $code = $this->workflow($args);
        Input::query($request)->done();

        return $this->listResponse($response, $this->columns->list($code));
    }

    /** @param array<string, string> $args */
    public function replace(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $code = $this->workflow($args);
        $input = Input::body($request);
        $rows = $input->objectList('columns', self::MAX_COLUMNS);
        if ($rows === []) {
            $input->fail('columns', 'required');
        }
        $columns = [];
        foreach ($rows as $position => $row) {
            $item = Input::nested('columns.' . $position, $row);
            $id = $item->nullableUuid('id');
            $name = $item->text('name', 1, 100);
            $stateIds = $item->uuidList('state_ids');
            $input->absorb($item);
            if ($name !== null && $stateIds !== null) {
                $columns[] = ['id' => $id, 'name' => trim($name), 'state_ids' => $stateIds];
            }
        }
        $input->done();

        return $this->listResponse(
            $response,
            $this->columns->replace(ActorContext::fromRequest($request), $code, $columns),
        );
    }

    /**
     * An unknown flow answers 404 like any other unknown resource.
     *
     * @param array<string, string> $args
     */
    private function workflow(array $args): WorkflowCode
    {
        return WorkflowCode::fromRoute($args['workflow'] ?? '') ?? throw ApiException::notFound();
    }

    /** @param list<BoardColumnRecord> $columns */
    private function listResponse(ResponseInterface $response, array $columns): ResponseInterface
    {
        return Json::write($response, [
            'data' => array_map(static fn (BoardColumnRecord $column): array => $column->toApi(), $columns),
        ]);
    }
}
