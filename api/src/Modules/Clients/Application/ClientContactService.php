<?php

declare(strict_types=1);

namespace Soltec\Modules\Clients\Application;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Clients\Domain\ClientRecord;
use Soltec\Modules\Clients\Persistence\ClientContactRepository;
use Soltec\Modules\Clients\Persistence\ClientRepository;
use Soltec\Modules\Contacts\Persistence\ContactRepository;

/**
 * Links the people of an adviser to a client with their roles (ADR-0025). Only a person the caller reaches by the data
 * scope of contacts can be linked or unlinked, and a link never makes the person visible to anyone else.
 */
final class ClientContactService
{
    private const ENTITY = 'clients';

    public function __construct(
        private readonly Connection $connection,
        private readonly ClientService $clientService,
        private readonly ClientRepository $clients,
        private readonly ClientContactRepository $links,
        private readonly ContactRepository $contacts,
        private readonly AuditLogger $audit,
    ) {
    }

    /**
     * Sets the roles one person has with the client, linking them if they were not.
     *
     * @param list<string> $contactTypeIds
     * @throws ApiException 403 (no `contacts.view`) or 404 (the client or the person is outside the caller's reach)
     * @throws ValidationException 422 `not_found` on a contact type that does not exist or is inactive
     */
    public function setRoles(
        CurrentUser $caller,
        ActorContext $actor,
        string $clientId,
        string $contactId,
        array $contactTypeIds,
    ): ClientRecord {
        $this->connection->transactional(
            function () use ($caller, $actor, $clientId, $contactId, $contactTypeIds): void {
                $this->requireBoth($caller, $clientId, $contactId);
                $before = $this->links->rolesOf($clientId, $contactId);
                $wanted = array_values(array_unique($contactTypeIds));
                $usable = array_merge($before, $this->clients->activeIds('contact_types', $wanted));
                $errors = [];
                foreach ($contactTypeIds as $position => $typeId) {
                    if (!in_array($typeId, $usable, true)) {
                        $errors[] = ['field' => sprintf('contact_type_ids.%d', $position), 'code' => 'not_found'];
                    }
                }
                if ($errors !== []) {
                    throw new ValidationException($errors);
                }

                sort($before);
                sort($wanted);
                if ($before === $wanted) {
                    return;
                }
                $this->links->replaceRoles($clientId, $contactId, $wanted);
                $this->audit->record(
                    $actor,
                    'contact_link',
                    self::ENTITY,
                    $clientId,
                    ['contact_id' => $contactId, 'contact_type_ids' => $before],
                    ['contact_id' => $contactId, 'contact_type_ids' => $wanted],
                );
            },
        );

        return $this->clientService->get($caller, $clientId);
    }

    /**
     * Unlinks the person from the client. Idempotent; the person is never deleted.
     *
     * @throws ApiException 403 or 404
     */
    public function unlink(CurrentUser $caller, ActorContext $actor, string $clientId, string $contactId): ClientRecord
    {
        $this->connection->transactional(function () use ($caller, $actor, $clientId, $contactId): void {
            $this->requireBoth($caller, $clientId, $contactId);
            $before = $this->links->rolesOf($clientId, $contactId);
            if ($before === []) {
                return;
            }

            $this->links->unlink($clientId, $contactId);
            $this->audit->record(
                $actor,
                'contact_unlink',
                self::ENTITY,
                $clientId,
                ['contact_id' => $contactId, 'contact_type_ids' => $before],
                null,
            );
        });

        return $this->clientService->get($caller, $clientId);
    }

    /** @throws ApiException 403 without `contacts.view`; 404 when the client or the person is outside the reach */
    private function requireBoth(CurrentUser $caller, string $clientId, string $contactId): void
    {
        if (!$caller->can('contacts', 'view')) {
            throw ApiException::forbidden();
        }
        if (!$this->clients->lock($clientId) || $this->clients->find($clientId, $caller) === null) {
            throw ApiException::notFound();
        }
        if ($this->contacts->find($contactId, $caller) === null) {
            throw ApiException::notFound();
        }
    }
}
