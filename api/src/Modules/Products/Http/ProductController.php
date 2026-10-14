<?php

declare(strict_types=1);

namespace Soltec\Modules\Products\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Http\CurrentUserAware;
use Soltec\Modules\Products\Application\ProductService;
use Soltec\Modules\Products\Domain\ProductData;
use Soltec\Modules\Products\Domain\ProductFilters;
use Soltec\Modules\Products\Domain\ProductOrder;
use Soltec\Modules\Products\Domain\ProductView;

/** /v1/products */
final class ProductController
{
    use CurrentUserAware;

    /** The most products a bulk action takes (ADR-0023). */
    private const MAX_BULK = 500;

    public function __construct(private readonly ProductService $products)
    {
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $filters = new ProductFilters(
            $query->nullableText('q', 100),
            (string) $query->choice('status', ['active', 'inactive', 'all'], 'active'),
            $query->nullableUuid('supplier_id'),
            $query->nullableUuid('area_id'),
            $query->nullableUuid('group_id'),
            $query->nullableUuid('brand_id'),
            $query->choice('stale', ['true', 'false'], 'false') === 'true',
        );
        $order = new ProductOrder(
            (string) $query->choice('sort', ProductOrder::SORTS, ProductOrder::NAME),
            $query->choice('grouped', ['true', 'false'], 'false') === 'true',
        );
        $levelId = $query->nullableUuid('margin_level_id');
        $page = $query->pagination();
        $query->done();

        $result = $this->products->list($filters, $order, $levelId, $page);

        return Json::write($response, [
            'data' => array_map(static fn (ProductView $view): array => $view->toApi(), $result['items']),
            'meta' => $page->meta($result['total']) + ['currency_code' => $result['basis']->currencyCode],
        ]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $data = $this->data($input);
        $input->done();

        $view = $this->products->create(ActorContext::fromRequest($request), $data);

        return Json::write($response, $view->toApi(), 201);
    }

    /** @param array<string, string> $args */
    public function show(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $query = Input::query($request);
        $levelId = $query->nullableUuid('margin_level_id');
        $query->done();

        return Json::write($response, $this->products->get($this->pathId($args, 'productId'), $levelId)->toApi());
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = $this->pathId($args, 'productId');
        $input = Input::body($request);
        $version = $input->version();
        $data = $this->data($input);
        $reviewed = $input->optionalBoolean('cost_reviewed');
        $input->done();

        $view = $this->products->update(ActorContext::fromRequest($request), $id, (int) $version, $data, $reviewed);

        return Json::write($response, $view->toApi());
    }

    /** @param array<string, string> $args */
    public function deactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $view = $this->products->deactivate(ActorContext::fromRequest($request), $this->pathId($args, 'productId'));

        return Json::write($response, $view->toApi());
    }

    /** @param array<string, string> $args */
    public function reactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $view = $this->products->reactivate(ActorContext::fromRequest($request), $this->pathId($args, 'productId'));

        return Json::write($response, $view->toApi());
    }

    /** @param array<string, string> $args */
    public function confirmCost(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $view = $this->products->confirmCost(ActorContext::fromRequest($request), $this->pathId($args, 'productId'));

        return Json::write($response, $view->toApi());
    }

    public function deactivateMany(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $ids = $this->ids($request);

        return Json::write($response, $this->products->deactivateMany(ActorContext::fromRequest($request), $ids));
    }

    /** By `ids`, or with `supplier_id` for every product the supplier took down with it. */
    public function reactivateMany(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $supplierId = $input->nullableUuid('supplier_id');
        $ids = $supplierId === null ? $input->uuidList('ids') : null;
        if ($supplierId !== null && $input->has('ids')) {
            $input->fail('ids', 'invalid');
        }
        $this->limit($input, $ids);
        $input->done();

        $actor = ActorContext::fromRequest($request);
        $result = $supplierId !== null
            ? $this->products->reactivateOfSupplier($actor, $supplierId)
            : $this->products->reactivateMany($actor, (array) $ids);

        return Json::write($response, $result);
    }

    public function confirmCostMany(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $ids = $this->ids($request);

        return Json::write($response, $this->products->confirmCostMany(ActorContext::fromRequest($request), $ids));
    }

    /** @return list<string> the `ids` of a bulk body */
    private function ids(ServerRequestInterface $request): array
    {
        $input = Input::body($request);
        $ids = $input->uuidList('ids');
        $this->limit($input, $ids);
        $input->done();

        return (array) $ids;
    }

    /** @param list<string>|null $ids */
    private function limit(Input $input, ?array $ids): void
    {
        if ($ids !== null && count($ids) > self::MAX_BULK) {
            $input->fail('ids', 'too_many');
        }
    }

    /** The fields a person types. An empty optional field is stored as nothing. */
    private function data(Input $input): ProductData
    {
        $name = $input->text('name', 1, 190);
        $description = $input->nullableText('description', 2000);
        $supplierId = $input->requiredUuid('supplier_id');
        $groupId = $input->requiredUuid('group_id');
        $unitId = $input->requiredUuid('unit_id');
        $brandId = $input->nullableUuid('brand_id');

        return new ProductData(
            (string) $name,
            $description,
            (string) $supplierId,
            (string) $groupId,
            $brandId,
            (string) $unitId,
            $this->cost($input),
            $input->optionalBoolean('check_availability'),
        );
    }

    /** The cost as a decimal string with four decimals: required and greater than zero. */
    private function cost(Input $input): string
    {
        $cost = $input->requiredDecimal('cost', 9, 4);
        if ($cost === null) {
            return '0.0000';
        }
        // Greater than zero: with a cost of nothing the price would be nothing too.
        if (preg_match('/[1-9]/', $cost) !== 1) {
            $input->fail('cost', 'out_of_range');
        }

        return $cost;
    }
}
