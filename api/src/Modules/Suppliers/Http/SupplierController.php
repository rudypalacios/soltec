<?php

declare(strict_types=1);

namespace Soltec\Modules\Suppliers\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Http\CurrentUserAware;
use Soltec\Modules\Suppliers\Application\SupplierService;
use Soltec\Modules\Suppliers\Domain\Identification;
use Soltec\Modules\Suppliers\Domain\SupplierAddress;
use Soltec\Modules\Suppliers\Domain\SupplierContact;
use Soltec\Modules\Suppliers\Domain\SupplierData;
use Soltec\Modules\Suppliers\Domain\SupplierRecord;

/** /v1/suppliers */
final class SupplierController
{
    use CurrentUserAware;

    private const MAX_ITEMS = 50;

    public function __construct(private readonly SupplierService $suppliers)
    {
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $text = $query->nullableText('q', 100);
        $status = $query->choice('status', ['active', 'inactive', 'all'], 'active');
        $page = $query->pagination();
        $query->done();

        $result = $this->suppliers->list($text, (string) $status, $page);

        return Json::write($response, [
            'data' => array_map(static fn (SupplierRecord $supplier): array => $supplier->toApi(), $result['records']),
            'meta' => $page->meta($result['total']),
        ]);
    }

    /** The active suppliers, for the selector of another form: open to any internal session (ADR-0024). */
    public function options(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $text = $query->nullableText('q', 100);
        $limit = $query->limit(50, 100);
        $query->done();

        return Json::write($response, ['data' => $this->suppliers->options($text, $limit)]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $data = $this->data($input);
        $input->done();

        $supplier = $this->suppliers->create(
            ActorContext::fromRequest($request),
            $data,
            $this->caller($request)->can('suppliers', 'deactivate'),
        );

        return Json::write($response, $supplier->toApi(), 201);
    }

    /** @param array<string, string> $args */
    public function show(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        return Json::write($response, $this->suppliers->get($this->pathId($args, 'supplierId'))->toApi());
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = $this->pathId($args, 'supplierId');
        $input = Input::body($request);
        $version = $input->version();
        $data = $this->data($input);
        $input->done();

        $supplier = $this->suppliers->update(
            ActorContext::fromRequest($request),
            $id,
            (int) $version,
            $data,
            $this->caller($request)->can('suppliers', 'deactivate'),
        );

        return Json::write($response, $supplier->toApi());
    }

    /** @param array<string, string> $args */
    public function deactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $supplier = $this->suppliers->deactivate(
            ActorContext::fromRequest($request),
            $this->pathId($args, 'supplierId'),
        );

        return Json::write($response, $supplier->toApi());
    }

    /** @param array<string, string> $args */
    public function reactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $supplier = $this->suppliers->reactivate(
            ActorContext::fromRequest($request),
            $this->pathId($args, 'supplierId'),
        );

        return Json::write($response, $supplier->toApi());
    }

    /** The fields a person types. An empty optional field is stored as nothing. */
    private function data(Input $input): SupplierData
    {
        $name = $input->text('name', 1, 190);
        $legalName = $input->nullableText('legal_name', 190);
        $type = $input->choice('identification_type', Identification::TYPES);
        $identification = $this->identification($input, (string) $type);
        $creditDays = $input->optionalInteger('credit_days', 0, 65535);
        $creditLimit = $input->optionalDecimal('credit_limit', 12, 2);

        return new SupplierData(
            (string) $name,
            $legalName,
            (string) $type,
            $identification,
            $creditDays,
            $creditLimit,
            $this->addresses($input),
            $this->contacts($input),
        );
    }

    /** The canonical identification: required for a NIT or a CUI, not accepted for `none`. */
    private function identification(Input $input, string $type): ?string
    {
        $typed = $input->nullableText('identification', 30);
        if ($type === Identification::NONE) {
            if ($typed !== null) {
                $input->fail('identification', 'not_applicable');
            }

            return null;
        }
        if ($type === '' || $typed === null) {
            if ($type !== '') {
                $input->fail('identification', 'required');
            }

            return null;
        }

        $canonical = Identification::canonical($type, $typed);
        if ($canonical === null) {
            $input->fail('identification', 'invalid');
        }

        return $canonical;
    }

    /** @return list<SupplierAddress> the first one is the primary when none was marked */
    private function addresses(Input $input): array
    {
        $addresses = [];
        $primaries = 0;
        foreach ($input->objectList('addresses', self::MAX_ITEMS) as $position => $item) {
            $row = Input::nested('addresses.' . $position, $item);
            $label = $row->text('label', 1, 60);
            $address = $row->text('address', 1, 255);
            $zone = $row->nullableText('zone', 100);
            $country = $row->nullableText('country', 100);
            $primary = $row->optionalBoolean('is_primary');
            if ($primary && ++$primaries > 1) {
                $row->fail('is_primary', 'duplicate');
            }
            $input->absorb($row);
            $addresses[] = new SupplierAddress((string) $label, (string) $address, $zone, $country, $primary);
        }

        if ($addresses !== [] && $primaries === 0) {
            $first = $addresses[0];
            $addresses[0] = new SupplierAddress($first->label, $first->address, $first->zone, $first->country, true);
        }

        return $addresses;
    }

    /** @return list<SupplierContact> */
    private function contacts(Input $input): array
    {
        $contacts = [];
        foreach ($input->objectList('contacts', self::MAX_ITEMS) as $position => $item) {
            $row = Input::nested('contacts.' . $position, $item);
            $name = $row->text('name', 1, 150);
            $typedEmail = $row->nullableText('email', 190);
            $contacts[] = new SupplierContact(
                (string) $name,
                $row->nullableText('job_title', 100),
                $row->nullableUuid('contact_type_id'),
                $row->nullableText('phone', 40),
                $row->nullableText('mobile', 40),
                $typedEmail === null ? null : $row->email('email'),
                $row->nullableText('address', 255),
                $row->nullableText('zone', 100),
                $row->nullableText('country', 100),
            );
            $input->absorb($row);
        }

        return $contacts;
    }
}
