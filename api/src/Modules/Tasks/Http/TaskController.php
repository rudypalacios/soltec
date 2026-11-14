<?php

declare(strict_types=1);

namespace Soltec\Modules\Tasks\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Http\CurrentUserAware;
use Soltec\Modules\Tasks\Application\TaskService;
use Soltec\Modules\Tasks\Domain\TaskData;
use Soltec\Modules\Tasks\Domain\TaskRecord;

/** /v1/tasks */
final class TaskController
{
    use CurrentUserAware;

    public function __construct(private readonly TaskService $tasks)
    {
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $text = $query->nullableText('q', 100);
        $status = $query->choice('status', ['active', 'inactive', 'all'], 'active');
        $relation = $query->choice('relation', ['any', 'owned', 'assigned'], 'any');
        $stateId = $query->nullableUuid('state_id');
        $taskTypeId = $query->nullableUuid('task_type_id');
        $assigneeId = $query->nullableUuid('assignee_id');
        $dueBefore = $query->date('due_before', false);
        $openOnly = $query->choice('open_only', ['true', 'false'], 'false') === 'true';
        $page = $query->pagination();
        $query->done();

        $result = $this->tasks->list(
            $this->caller($request),
            $text,
            (string) $status,
            (string) $relation,
            $stateId,
            $taskTypeId,
            $assigneeId,
            $dueBefore,
            $openOnly,
            $page,
        );

        return Json::write($response, [
            'data' => array_map(static fn (TaskRecord $task): array => $task->toApi(), $result['records']),
            'meta' => $page->meta($result['total']),
        ]);
    }

    /**
     * The board of tasks: the columns of the flow, each with its total and a page of its tasks. `column_id` asks
     * for one column only (its next page); `page` and `per_page` are per column.
     */
    public function board(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $text = $query->nullableText('q', 100);
        $status = $query->choice('status', ['active', 'inactive', 'all'], 'active');
        $relation = $query->choice('relation', ['any', 'owned', 'assigned'], 'any');
        $columnId = $query->nullableUuid('column_id');
        $page = $query->pagination();
        $query->done();

        $board = $this->tasks->board(
            $this->caller($request),
            $text,
            (string) $status,
            (string) $relation,
            $columnId,
            $page,
        );

        return Json::write($response, [
            'data' => array_map(
                static fn (array $entry): array => $entry['column']->toApi() + [
                    'total' => $entry['total'],
                    'tasks' => array_map(static fn (TaskRecord $task): array => $task->toApi(), $entry['records']),
                ],
                $board,
            ),
        ]);
    }

    /** The people a task can be assigned to, for the assignee selector. */
    public function assigneeOptions(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $text = $query->nullableText('q', 100);
        $limit = $query->limit(50, 100);
        $query->done();

        return Json::write($response, ['data' => $this->tasks->assigneeOptions($text, $limit)]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $data = $this->data($input);
        $input->done();

        $caller = $this->caller($request);
        $task = $this->tasks->create($caller, ActorContext::fromRequest($request), $data);

        return Json::write($response, $task->toApi($this->tasks->nextStates($caller, $task)), 201);
    }

    /** @param array<string, string> $args */
    public function show(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $caller = $this->caller($request);
        $task = $this->tasks->get($caller, $this->pathId($args, 'taskId'));

        return Json::write($response, $task->toApi($this->tasks->nextStates($caller, $task)));
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = $this->pathId($args, 'taskId');
        $input = Input::body($request);
        $version = $input->version();
        $data = $this->data($input);
        $input->done();

        $caller = $this->caller($request);
        $task = $this->tasks->update($caller, ActorContext::fromRequest($request), $id, (int) $version, $data);

        return Json::write($response, $task->toApi($this->tasks->nextStates($caller, $task)));
    }

    /** @param array<string, string> $args */
    public function transition(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $id = $this->pathId($args, 'taskId');
        $input = Input::body($request);
        $version = $input->version();
        $stateId = $input->requiredUuid('state_id');
        $reason = $input->nullableText('reason', 1000);
        $proposed = $input->date('proposed_due_date', false);
        $accept = $input->optionalBoolean('accept_proposed_due_date');
        $input->done();

        $caller = $this->caller($request);
        $task = $this->tasks->transition(
            $caller,
            ActorContext::fromRequest($request),
            $id,
            (int) $version,
            (string) $stateId,
            $reason,
            $proposed,
            $accept,
        );

        return Json::write($response, $task->toApi($this->tasks->nextStates($caller, $task)));
    }

    /** @param array<string, string> $args */
    public function deactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $caller = $this->caller($request);
        $task = $this->tasks->deactivate($caller, ActorContext::fromRequest($request), $this->pathId($args, 'taskId'));

        return Json::write($response, $task->toApi($this->tasks->nextStates($caller, $task)));
    }

    /** @param array<string, string> $args */
    public function reactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $caller = $this->caller($request);
        $task = $this->tasks->reactivate($caller, ActorContext::fromRequest($request), $this->pathId($args, 'taskId'));

        return Json::write($response, $task->toApi($this->tasks->nextStates($caller, $task)));
    }

    /** The fields a person types. An empty description is stored as nothing. */
    private function data(Input $input): TaskData
    {
        return new TaskData(
            (string) $input->text('title', 1, 150),
            $input->nullableText('description', 5000),
            (string) $input->requiredUuid('task_type_id'),
            (string) $input->requiredUuid('assignee_id'),
            (string) $input->date('due_date'),
        );
    }
}
