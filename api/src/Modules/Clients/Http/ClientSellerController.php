<?php

declare(strict_types=1);

namespace Soltec\Modules\Clients\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Http\CurrentUserAware;
use Soltec\Modules\Clients\Application\ClientSellerService;

/** The advisers of a client: /v1/clients/{clientId}/sellers, /responsible, /reassign and /v1/clients/reassign */
final class ClientSellerController
{
    use CurrentUserAware;

    public function __construct(private readonly ClientSellerService $sellers)
    {
    }

    /** Who can be made an adviser, for the selector. Open to any internal session (ADR-0024). */
    public function options(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $text = $query->nullableText('q', 100);
        $limit = $query->limit(50, 100);
        $query->done();

        return Json::write($response, ['data' => $this->sellers->options($text, $limit)]);
    }

    /** @param array<string, string> $args */
    public function add(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = $this->pathId($args, 'clientId');
        $input = Input::body($request);
        $userId = $input->requiredUuid('user_id');
        $input->done();

        $client = $this->sellers->add(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $id,
            (string) $userId,
        );

        return Json::write($response, $client->toApi());
    }

    /** @param array<string, string> $args */
    public function remove(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $client = $this->sellers->remove(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $this->pathId($args, 'clientId'),
            $this->pathId($args, 'userId'),
        );

        return Json::write($response, $client->toApi());
    }

    /** @param array<string, string> $args */
    public function makeResponsible(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $id = $this->pathId($args, 'clientId');
        $input = Input::body($request);
        $userId = $input->requiredUuid('user_id');
        $input->done();

        $client = $this->sellers->makeResponsible(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $id,
            (string) $userId,
        );

        return Json::write($response, $client->toApi());
    }

    /** @param array<string, string> $args */
    public function reassign(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $id = $this->pathId($args, 'clientId');
        $input = Input::body($request);
        $from = $input->requiredUuid('from_user_id');
        $to = $input->requiredUuid('to_user_id');
        $moveContacts = $input->optionalBoolean('move_contacts', true);
        $input->done();

        $result = $this->sellers->reassign(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $id,
            (string) $from,
            (string) $to,
            $moveContacts,
        );

        return Json::write($response, [
            'client' => $result['client']->toApi(),
            'contacts_moved' => $result['contacts_moved'],
            'contacts_kept' => $result['contacts_kept'],
        ]);
    }

    public function reassignPortfolio(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $from = $input->requiredUuid('from_user_id');
        $to = $input->requiredUuid('to_user_id');
        $moveContacts = $input->optionalBoolean('move_contacts', true);
        $input->done();

        return Json::write($response, $this->sellers->reassignPortfolio(
            $this->caller($request),
            ActorContext::fromRequest($request),
            (string) $from,
            (string) $to,
            $moveContacts,
        ));
    }
}
