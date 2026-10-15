<?php

declare(strict_types=1);

namespace Soltec\Modules\Clients\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Http\CurrentUserAware;
use Soltec\Modules\Clients\Application\ClientContactService;

/** /v1/clients/{clientId}/contacts/{contactId} */
final class ClientContactController
{
    use CurrentUserAware;

    public function __construct(private readonly ClientContactService $contacts)
    {
    }

    /** @param array<string, string> $args */
    public function setRoles(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $clientId = $this->pathId($args, 'clientId');
        $contactId = $this->pathId($args, 'contactId');
        $input = Input::body($request);
        $typeIds = $input->uuidList('contact_type_ids');
        $input->done();

        $client = $this->contacts->setRoles(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $clientId,
            $contactId,
            $typeIds ?? [],
        );

        return Json::write($response, $client->toApi());
    }

    /** @param array<string, string> $args */
    public function unlink(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $client = $this->contacts->unlink(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $this->pathId($args, 'clientId'),
            $this->pathId($args, 'contactId'),
        );

        return Json::write($response, $client->toApi());
    }
}
