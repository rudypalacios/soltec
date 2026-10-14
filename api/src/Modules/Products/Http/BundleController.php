<?php

declare(strict_types=1);

namespace Soltec\Modules\Products\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Http\CurrentUserAware;
use Soltec\Modules\Products\Application\BundleService;
use Soltec\Modules\Products\Domain\BundleData;
use Soltec\Modules\Products\Domain\BundleItemData;
use Soltec\Modules\Products\Domain\BundleView;
use Soltec\Modules\Products\Domain\ProductFilters;
use Soltec\Modules\Products\Domain\ProductOrder;

/** /v1/bundles */
final class BundleController
{
    use CurrentUserAware;

    /** The most components a bundle takes: a bundle of hundreds of lines is a mistake, and every read adds them up. */
    private const MAX_ITEMS = 100;

    public function __construct(private readonly BundleService $bundles)
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

        $result = $this->bundles->list($filters, $order, $levelId, $page);

        return Json::write($response, [
            'data' => array_map(static fn (BundleView $view): array => $view->toApi(), $result['items']),
            'meta' => $page->meta($result['total']) + ['currency_code' => $result['basis']->currencyCode],
        ]);
    }

    /** Active products to choose a component among; the ones already in the bundle are left out by `exclude`. */
    public function candidates(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $text = $query->nullableText('q', 100);
        $excluded = $this->excluded($query);
        $limit = $query->limit(20, 50);
        $query->done();

        return Json::write($response, ['data' => $this->bundles->candidates($text, $excluded, $limit)]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $data = $this->data($input);
        $input->done();

        $view = $this->bundles->create(ActorContext::fromRequest($request), $data);

        return Json::write($response, $view->toApi(), 201);
    }

    /** @param array<string, string> $args */
    public function show(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $query = Input::query($request);
        $levelId = $query->nullableUuid('margin_level_id');
        $query->done();

        return Json::write($response, $this->bundles->get($this->pathId($args, 'bundleId'), $levelId)->toApi());
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = $this->pathId($args, 'bundleId');
        $input = Input::body($request);
        $version = $input->version();
        $data = $this->data($input);
        $input->done();

        $view = $this->bundles->update(ActorContext::fromRequest($request), $id, (int) $version, $data);

        return Json::write($response, $view->toApi());
    }

    /** @param array<string, string> $args */
    public function deactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $view = $this->bundles->deactivate(ActorContext::fromRequest($request), $this->pathId($args, 'bundleId'));

        return Json::write($response, $view->toApi());
    }

    /** @param array<string, string> $args */
    public function reactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $view = $this->bundles->reactivate(ActorContext::fromRequest($request), $this->pathId($args, 'bundleId'));

        return Json::write($response, $view->toApi());
    }

    /** The fields a person types. An empty optional field is stored as nothing. */
    private function data(Input $input): BundleData
    {
        $name = $input->text('name', 1, 190);
        $description = $input->nullableText('description', 2000);
        $groupId = $input->requiredUuid('group_id');
        $brandId = $input->nullableUuid('brand_id');

        return new BundleData((string) $name, $description, (string) $groupId, $brandId, $this->items($input));
    }

    /**
     * The components: at least one, a product once, a quantity greater than zero with up to three decimals.
     *
     * @return list<BundleItemData>
     */
    private function items(Input $input): array
    {
        if ($input->isEmptyList('items')) {
            $input->fail('items', 'required');
        }
        $rows = $input->objectList('items', self::MAX_ITEMS);

        $items = [];
        $seen = [];
        foreach ($rows as $position => $row) {
            $item = Input::nested('items.' . $position, $row);
            $productId = $item->requiredUuid('product_id');
            $quantity = $item->requiredDecimal('quantity', 9, 3);
            if ($quantity !== null && preg_match('/[1-9]/', $quantity) !== 1) {
                $item->fail('quantity', 'out_of_range');
            }
            if ($productId !== null && isset($seen[$productId])) {
                $item->fail('product_id', 'duplicate');
            }
            $input->absorb($item);
            if ($productId !== null && $quantity !== null) {
                $seen[$productId] = true;
                $items[] = new BundleItemData($productId, $quantity);
            }
        }

        return $items;
    }

    /**
     * The `exclude` of a search: product ids separated by commas.
     *
     * @return list<string>
     */
    private function excluded(Input $query): array
    {
        $raw = $query->nullableText('exclude', 4000);
        if ($raw === null) {
            return [];
        }
        $ids = [];
        foreach (explode(',', $raw) as $candidate) {
            $id = trim($candidate);
            if (!Uuid::isValid($id)) {
                $query->fail('exclude', 'invalid');

                return [];
            }
            $ids[] = strtolower($id);
        }

        return array_values(array_unique($ids));
    }
}
