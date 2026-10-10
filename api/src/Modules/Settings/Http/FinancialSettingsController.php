<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Settings\Application\FinancialSettingsService;

/** /v1/settings/financial */
final class FinancialSettingsController
{
    public function __construct(private readonly FinancialSettingsService $settings)
    {
    }

    public function show(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, $this->settings->get()->toApi());
    }

    public function update(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $version = $input->version();
        $vatRate = $input->rate('vat_rate');
        $incomeTaxRate = $input->rate('income_tax_rate');
        $staleCostDays = $input->integer('stale_cost_days', 1, 3650);
        $quoteValidityDays = $input->integer('quote_validity_days', 1, 365);
        $input->done();

        $settings = $this->settings->update(
            ActorContext::fromRequest($request),
            (int) $version,
            (string) $vatRate,
            (string) $incomeTaxRate,
            (int) $staleCostDays,
            (int) $quoteValidityDays,
        );

        return Json::write($response, $settings->toApi());
    }
}
