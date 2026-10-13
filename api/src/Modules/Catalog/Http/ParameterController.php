<?php

declare(strict_types=1);

namespace Soltec\Modules\Catalog\Http;

use LogicException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Routing\RouteContext;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Http\CurrentUserAware;
use Soltec\Modules\Catalog\Application\ParameterService;
use Soltec\Modules\Catalog\Domain\ParameterCatalog;
use Soltec\Modules\Catalog\Domain\ParameterDefinition;
use Soltec\Modules\Catalog\Domain\ParameterRecord;

/**
 * /v1/<slug> for every catalog list. The route says which parameter it serves in its `parameter` argument
 * (the slug), so one controller answers all of them.
 */
final class ParameterController
{
    use CurrentUserAware;

    private const COLOR_PATTERN = '/^#[0-9A-Fa-f]{6}$/';

    public function __construct(private readonly ParameterService $parameters)
    {
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $text = $query->nullableText('q', 100);
        $status = $query->choice('status', ['active', 'inactive', 'all'], 'active');
        $parameter = $this->parameter($request);
        $parentId = $parameter->parent === null ? null : $query->nullableUuid($parameter->parent->column);
        $page = $query->pagination();
        $query->done();

        $result = $this->parameters->list($parameter, $text, (string) $status, $parentId, $page);

        return Json::write($response, [
            'data' => array_map(static fn (ParameterRecord $record): array => $record->toApi(), $result['records']),
            'meta' => $page->meta($result['total']),
        ]);
    }

    /** The active values with id and name, for the selectors of other forms. */
    public function options(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, ['data' => $this->parameters->options($this->parameter($request))]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $parameter = $this->parameter($request);
        $input = Input::body($request);
        $name = $input->text('name', 1, $parameter->nameMax);
        $color = $this->color($input, $parameter);
        $parentId = $this->parentId($input, $parameter);
        $input->done();

        $record = $this->parameters->create(
            ActorContext::fromRequest($request),
            $parameter,
            (string) $name,
            $color,
            $parentId,
        );

        return Json::write($response, $record->toApi(), 201);
    }

    /** @param array<string, string> $args */
    public function show(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $parameter = $this->parameter($request);
        $record = $this->parameters->get($parameter, $this->pathId($args, $parameter->idParameter));

        return Json::write($response, $record->toApi());
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $parameter = $this->parameter($request);
        $id = $this->pathId($args, $parameter->idParameter);
        $input = Input::body($request);
        $version = $input->version();
        $name = $input->text('name', 1, $parameter->nameMax);
        $color = $this->color($input, $parameter);
        $parentId = $this->parentId($input, $parameter);
        $input->done();

        $record = $this->parameters->update(
            ActorContext::fromRequest($request),
            $parameter,
            $id,
            (int) $version,
            (string) $name,
            $color,
            $parentId,
        );

        return Json::write($response, $record->toApi());
    }

    /** @param array<string, string> $args */
    public function deactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $parameter = $this->parameter($request);
        $record = $this->parameters->deactivate(
            ActorContext::fromRequest($request),
            $parameter,
            $this->pathId($args, $parameter->idParameter),
        );

        return Json::write($response, $record->toApi());
    }

    /** @param array<string, string> $args */
    public function reactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $parameter = $this->parameter($request);
        $record = $this->parameters->reactivate(
            ActorContext::fromRequest($request),
            $parameter,
            $this->pathId($args, $parameter->idParameter),
        );

        return Json::write($response, $record->toApi());
    }

    private function parameter(ServerRequestInterface $request): ParameterDefinition
    {
        $route = RouteContext::fromRequest($request)->getRoute() ?? throw new LogicException('No route matched.');
        $slug = $route->getArgument('parameter');

        return ParameterCatalog::bySlug(is_string($slug) ? $slug : '');
    }

    /** The parent the value belongs to, required for the lists that have one and ignored for the rest. */
    private function parentId(Input $input, ParameterDefinition $parameter): ?string
    {
        if ($parameter->parent === null) {
            return null;
        }
        $parentId = $input->nullableUuid($parameter->parent->column);
        if ($parentId === null && !$input->has($parameter->parent->column)) {
            $input->fail($parameter->parent->column, 'required');
        }

        return $parentId;
    }

    /** The `#RRGGBB` color in upper case, required for the parameters that have one and ignored for the rest. */
    private function color(Input $input, ParameterDefinition $parameter): ?string
    {
        if (!$parameter->hasColor) {
            return null;
        }
        $color = $input->text('color', 1, 64);
        if ($color !== null && preg_match(self::COLOR_PATTERN, $color) !== 1) {
            $input->fail('color', 'invalid');

            return null;
        }

        return $color === null ? null : strtoupper($color);
    }
}
