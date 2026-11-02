<?php

declare(strict_types=1);

namespace Soltec\Modules\Workflow\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Http\CurrentUserAware;
use Soltec\Modules\Workflow\Application\WorkflowStateService;
use Soltec\Modules\Workflow\Domain\WorkflowCode;
use Soltec\Modules\Workflow\Domain\WorkflowStateRecord;

/** /v1/workflows/{workflow}/states and /v1/workflows/{workflow}/transitions */
final class WorkflowStateController
{
    use CurrentUserAware;

    private const COLOR_PATTERN = '/^#[0-9A-Fa-f]{6}$/';
    private const MAX_TRANSITIONS = 400;

    public function __construct(private readonly WorkflowStateService $states)
    {
    }

    /** @param array<string, string> $args */
    public function list(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $code = $this->workflow($args);
        $query = Input::query($request);
        $status = $query->choice('status', ['active', 'inactive', 'all'], 'all');
        $query->done();

        return $this->listResponse($response, $this->states->list($code, (string) $status));
    }

    /** @param array<string, string> $args */
    public function create(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $code = $this->workflow($args);
        $input = Input::body($request);
        $name = $input->text('name', 1, 100);
        $color = $this->color($input);
        $isTerminal = $input->optionalBoolean('is_terminal');
        $input->done();

        $state = $this->states->create(
            ActorContext::fromRequest($request),
            $code,
            (string) $name,
            (string) $color,
            $isTerminal,
        );

        return Json::write($response, $state->toApi(), 201);
    }

    /** @param array<string, string> $args */
    public function show(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $state = $this->states->get($this->workflow($args), $this->pathId($args, 'stateId'));

        return Json::write($response, $state->toApi());
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $code = $this->workflow($args);
        $id = $this->pathId($args, 'stateId');
        $input = Input::body($request);
        $version = $input->version();
        $name = $input->text('name', 1, 100);
        $color = $this->color($input);
        $isTerminal = $input->optionalBoolean('is_terminal');
        $makeInitial = $input->optionalBoolean('is_initial');
        $input->done();

        $state = $this->states->update(
            ActorContext::fromRequest($request),
            $code,
            $id,
            (int) $version,
            (string) $name,
            (string) $color,
            $isTerminal,
            $makeInitial,
        );

        return Json::write($response, $state->toApi());
    }

    /** @param array<string, string> $args */
    public function deactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $state = $this->states->deactivate(
            ActorContext::fromRequest($request),
            $this->workflow($args),
            $this->pathId($args, 'stateId'),
        );

        return Json::write($response, $state->toApi());
    }

    /** @param array<string, string> $args */
    public function reactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $state = $this->states->reactivate(
            ActorContext::fromRequest($request),
            $this->workflow($args),
            $this->pathId($args, 'stateId'),
        );

        return Json::write($response, $state->toApi());
    }

    /** @param array<string, string> $args */
    public function reorder(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $code = $this->workflow($args);
        $input = Input::body($request);
        $ids = $input->uuidList('ids');
        $input->done();

        return $this->listResponse(
            $response,
            $this->states->reorder(ActorContext::fromRequest($request), $code, $ids ?? []),
        );
    }

    /** @param array<string, string> $args */
    public function setTransitions(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $code = $this->workflow($args);
        $input = Input::body($request);
        $pairs = [];
        foreach ($input->objectList('transitions', self::MAX_TRANSITIONS) as $position => $row) {
            $item = Input::nested('transitions.' . $position, $row);
            $from = $item->requiredUuid('from_id');
            $to = $item->requiredUuid('to_id');
            $input->absorb($item);
            if ($from !== null && $to !== null) {
                $pairs[] = [$from, $to];
            }
        }
        $input->done();

        return $this->listResponse(
            $response,
            $this->states->setTransitions(ActorContext::fromRequest($request), $code, $pairs),
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

    /** The `#RRGGBB` color in upper case. */
    private function color(Input $input): ?string
    {
        $color = $input->text('color', 1, 64);
        if ($color !== null && preg_match(self::COLOR_PATTERN, $color) !== 1) {
            $input->fail('color', 'invalid');

            return null;
        }

        return $color === null ? null : strtoupper($color);
    }

    /** @param list<WorkflowStateRecord> $states */
    private function listResponse(ResponseInterface $response, array $states): ResponseInterface
    {
        return Json::write($response, [
            'data' => array_map(static fn (WorkflowStateRecord $state): array => $state->toApi(), $states),
        ]);
    }
}
