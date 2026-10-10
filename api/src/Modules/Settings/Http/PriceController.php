<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Settings\Application\PriceService;

/** /v1/price */
final class PriceController
{
    public function __construct(private readonly PriceService $prices)
    {
    }

    public function calculate(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $cost = $input->text('cost', 1, 20);
        $marginLevelId = $input->nullableUuid('margin_level_id');
        $input->done();

        $result = $this->prices->calculate((string) $cost, $marginLevelId);

        return Json::write($response, [
            'margin_level' => [
                'id' => $result['level']->id,
                'name' => $result['level']->name,
                'rate' => $result['level']->rate,
            ],
            'vat_rate' => $result['vat_rate'],
            'income_tax_rate' => $result['income_tax_rate'],
        ] + $result['price']->toApi());
    }
}
