<?php

declare(strict_types=1);

namespace Soltec\Modules\Contacts\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Http\CurrentUserAware;
use Soltec\Modules\Contacts\Application\ContactService;
use Soltec\Modules\Contacts\Domain\ContactData;
use Soltec\Modules\Contacts\Domain\ContactRecord;

/** /v1/contacts */
final class ContactController
{
    use CurrentUserAware;

    public function __construct(private readonly ContactService $contacts)
    {
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $text = $query->nullableText('q', 100);
        $status = $query->choice('status', ['active', 'inactive', 'all'], 'active');
        $ownerId = $query->nullableUuid('owner_id');
        $page = $query->pagination();
        $query->done();

        $result = $this->contacts->list($this->caller($request), $text, (string) $status, $ownerId, $page);

        return Json::write($response, [
            'data' => array_map(static fn (ContactRecord $contact): array => $contact->toApi(), $result['records']),
            'meta' => $page->meta($result['total']),
        ]);
    }

    /** The people the caller can hand a contact to, for the owner selector. */
    public function ownerOptions(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $text = $query->nullableText('q', 100);
        $limit = $query->limit(50, 100);
        $query->done();

        return Json::write($response, [
            'data' => $this->contacts->ownerOptions($this->caller($request), $text, $limit),
        ]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $data = $this->data($input);
        $input->done();

        $contact = $this->contacts->create($this->caller($request), ActorContext::fromRequest($request), $data);

        return Json::write($response, $contact->toApi(), 201);
    }

    /** @param array<string, string> $args */
    public function show(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $contact = $this->contacts->get($this->caller($request), $this->pathId($args, 'contactId'));

        return Json::write($response, $contact->toApi());
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = $this->pathId($args, 'contactId');
        $input = Input::body($request);
        $version = $input->version();
        $data = $this->data($input);
        $ownerId = $input->nullableUuid('owner_id');
        $input->done();

        $contact = $this->contacts->update(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $id,
            (int) $version,
            $data,
            $ownerId,
        );

        return Json::write($response, $contact->toApi());
    }

    /** @param array<string, string> $args */
    public function deactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $contact = $this->contacts->deactivate(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $this->pathId($args, 'contactId'),
        );

        return Json::write($response, $contact->toApi());
    }

    /** @param array<string, string> $args */
    public function reactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $contact = $this->contacts->reactivate(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $this->pathId($args, 'contactId'),
        );

        return Json::write($response, $contact->toApi());
    }

    /** The fields a person types. An empty optional field is stored as nothing. */
    private function data(Input $input): ContactData
    {
        $name = $input->text('name', 1, 150);
        $typedEmail = $input->nullableText('email', 190);
        $email = $typedEmail === null ? null : $input->email('email');

        return new ContactData(
            (string) $name,
            $input->nullableText('phone', 40),
            $input->nullableText('mobile', 40),
            $email,
            $input->nullableText('address', 255),
            $input->nullableText('zone', 100),
            $input->nullableText('country', 100),
        );
    }
}
