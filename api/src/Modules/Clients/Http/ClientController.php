<?php

declare(strict_types=1);

namespace Soltec\Modules\Clients\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Address;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Kernel\Identification;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Http\CurrentUserAware;
use Soltec\Modules\Clients\Application\ClientService;
use Soltec\Modules\Clients\Domain\BillingProfile;
use Soltec\Modules\Clients\Domain\ClientData;
use Soltec\Modules\Clients\Domain\ClientFilters;
use Soltec\Modules\Clients\Domain\ClientRecord;

/** /v1/clients and /v1/me/client */
final class ClientController
{
    use CurrentUserAware;

    private const MAX_ADDRESSES = 50;

    public function __construct(private readonly ClientService $clients)
    {
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $filters = new ClientFilters(
            $query->nullableText('q', 100),
            (string) $query->choice('status', ['active', 'inactive', 'all'], 'active'),
            $query->choice('type', ['prospect', 'customer'], '') ?: null,
            $query->nullableUuid('status_id'),
            $query->nullableUuid('segment_id'),
            $query->nullableUuid('seller_id'),
        );
        $page = $query->pagination();
        $query->done();

        $result = $this->clients->list($this->caller($request), $filters, $page);

        return Json::write($response, [
            'data' => array_map(static fn (ClientRecord $client): array => $client->toApi(), $result['records']),
            'meta' => $page->meta($result['total']),
        ]);
    }

    /** Clients the caller reaches whose name resembles `name`, to warn of a duplicate while registering. */
    public function similar(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $name = $query->text('name', 1, 190);
        $query->done();

        return Json::write($response, ['data' => $this->clients->similar($this->caller($request), (string) $name)]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $data = $this->data($input, withBilling: false);
        $input->done();

        $client = $this->clients->create($this->caller($request), ActorContext::fromRequest($request), $data);

        return Json::write($response, $client->toApi(), 201);
    }

    /** @param array<string, string> $args */
    public function show(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $client = $this->clients->get($this->caller($request), $this->pathId($args, 'clientId'));

        return Json::write($response, $client->toApi());
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = $this->pathId($args, 'clientId');
        $input = Input::body($request);
        $version = $input->version();
        $data = $this->data($input, withBilling: true);
        $input->done();

        $client = $this->clients->update(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $id,
            (int) $version,
            $data,
        );

        return Json::write($response, $client->toApi());
    }

    /** @param array<string, string> $args */
    public function convert(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $id = $this->pathId($args, 'clientId');
        $input = Input::body($request);
        $version = $input->version();
        $type = (string) $input->choice('identification_type', Identification::TYPES);
        $identification = Identification::fromInput($input, $type);
        $billing = $this->billing($input, required: true);
        $input->done();

        $client = $this->clients->convert(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $id,
            (int) $version,
            $type,
            $identification,
            $billing ?? throw new \LogicException('The billing profile is required.'),
        );

        return Json::write($response, $client->toApi());
    }

    /** @param array<string, string> $args */
    public function deactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $client = $this->clients->deactivate(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $this->pathId($args, 'clientId'),
        );

        return Json::write($response, $client->toApi());
    }

    /** @param array<string, string> $args */
    public function reactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $client = $this->clients->reactivate(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $this->pathId($args, 'clientId'),
        );

        return Json::write($response, $client->toApi());
    }

    /** What the signed-in external user sees of their own client. */
    public function mine(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, $this->clients->profileOf($this->caller($request)));
    }

    /**
     * The fields a person types. An empty optional field is stored as nothing. A prospect may leave the
     * identification type out (it is then `none`); a customer's is part of the whole that an edit replaces.
     */
    private function data(Input $input, bool $withBilling): ClientData
    {
        $name = $input->text('name', 1, 190);
        $type = (string) $input->choice('identification_type', Identification::TYPES, Identification::NONE);

        return new ClientData(
            (string) $name,
            $type,
            Identification::fromInput($input, $type),
            $input->nullableUuid('status_id'),
            $input->nullableUuid('segment_id'),
            $input->nullableUuid('area_id'),
            $input->nullableUuid('margin_level_id'),
            Address::listFromInput($input, self::MAX_ADDRESSES),
            $withBilling ? $this->billing($input, required: false) : null,
        );
    }

    private function billing(Input $input, bool $required): ?BillingProfile
    {
        $raw = $input->object('billing_profile', $required);
        if ($raw === null) {
            return null;
        }

        $row = Input::nested('billing_profile', $raw);
        $legalName = $row->text('legal_name', 1, 190);
        $taxRegimeId = $row->requiredUuid('tax_regime_id');
        $profile = new BillingProfile(
            (string) $legalName,
            (string) $taxRegimeId,
            $row->nullableUuid('payment_method_id'),
            $row->optionalInteger('credit_days', 0, 65535),
            $row->optionalDecimal('credit_limit', 12, 2),
        );
        $input->absorb($row);

        return $profile;
    }
}
