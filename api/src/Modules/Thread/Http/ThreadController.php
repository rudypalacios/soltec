<?php

declare(strict_types=1);

namespace Soltec\Modules\Thread\Http;

use LogicException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Routing\RouteContext;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Http\CurrentUserAware;
use Soltec\Modules\Thread\Application\ThreadService;
use Soltec\Modules\Thread\Domain\ThreadCursor;
use Soltec\Modules\Thread\Domain\ThreadEntryRecord;

/**
 * The thread of a record (`/v1/tasks/{taskId}/thread`, later tickets) and its entries (`/v1/thread-entries/{id}`). The
 * route says which kind of record it is in the `subject` argument, and its id is in the placeholder `{<subject>Id}`.
 */
final class ThreadController
{
    use CurrentUserAware;

    public function __construct(private readonly ThreadService $thread)
    {
    }

    /** @param array<string, string> $args */
    public function list(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        [$type, $subjectId] = $this->subject($request, $args);
        $query = Input::query($request);
        $limit = $query->limit();
        $token = $query->nullableText('cursor', 200);
        $after = $token === null || $token === '' ? null : ThreadCursor::decode($token);
        if ($token !== null && $token !== '' && $after === null) {
            $query->fail('cursor', 'invalid');
        }
        $query->done();

        $page = $this->thread->list($this->caller($request), $type, $subjectId, $after, $limit);

        return Json::write($response, [
            'data' => array_map(static fn (ThreadEntryRecord $entry): array => $entry->toApi(), $page['entries']),
            'meta' => ['limit' => $limit, 'next_cursor' => $page['next']?->encode()],
        ]);
    }

    /** @param array<string, string> $args */
    public function comment(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        [$type, $subjectId] = $this->subject($request, $args);
        $input = Input::body($request);
        $id = $input->nullableUuid('id');
        $body = $input->text('body', 0, ThreadService::MAX_BODY, false) ?? '';
        $fileIds = $input->uuidList('file_ids', false) ?? [];
        $input->done();

        $result = $this->thread->comment(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $type,
            $subjectId,
            $id,
            $body,
            $fileIds,
        );

        return Json::write($response, $result['entry']->toApi(), $result['created'] ? 201 : 200);
    }

    /** @param array<string, string> $args */
    public function mentionOptions(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        [$type, $subjectId] = $this->subject($request, $args);
        $query = Input::query($request);
        $text = $query->nullableText('q', 100);
        $limit = $query->limit(10, 50);
        $query->done();

        return Json::write($response, [
            'data' => $this->thread->mentionOptions($this->caller($request), $type, $subjectId, $text, $limit),
        ]);
    }

    /** @param array<string, string> $args */
    public function edit(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = $this->pathId($args, 'entryId');
        $input = Input::body($request);
        $version = $input->version();
        $body = $input->text('body', 0, ThreadService::MAX_BODY, false) ?? '';
        $input->done();

        $entry = $this->thread->edit(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $id,
            (int) $version,
            $body,
        );

        return Json::write($response, $entry->toApi());
    }

    /** @param array<string, string> $args */
    public function deactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $entry = $this->thread->deactivate(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $this->pathId($args, 'entryId'),
        );

        return Json::write($response, $entry->toApi());
    }

    /**
     * @param array<string, string> $args
     * @return array{0: string, 1: string} the kind of record and its id
     */
    private function subject(ServerRequestInterface $request, array $args): array
    {
        $route = RouteContext::fromRequest($request)->getRoute() ?? throw new LogicException('No route matched.');
        $type = $route->getArgument('subject') ?? throw new LogicException('The route names no thread subject.');

        return [$type, $this->pathId($args, $type . 'Id')];
    }
}
