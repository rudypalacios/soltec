<?php

declare(strict_types=1);

namespace Soltec\Modules\Contacts\Application;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Auth\DataScope;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Contacts\Domain\ContactData;
use Soltec\Modules\Contacts\Domain\ContactRecord;
use Soltec\Modules\Contacts\Persistence\ContactRepository;
use Soltec\Modules\Settings\Application\SequenceGenerator;

/**
 * Administration of contacts. A contact belongs to the user who entered it and the data scope of the resource
 * decides whose contacts a user reaches (ADR-0025); one outside the scope does not exist for them (404). Linking a
 * contact to a client or a supplier does not make it visible to anyone else. Deactivating never blocks (ADR-0023).
 */
final class ContactService
{
    private const ENTITY = 'contacts';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly ContactRepository $contacts,
        private readonly SequenceGenerator $sequences,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return array{records: list<ContactRecord>, total: int} */
    public function list(CurrentUser $caller, ?string $text, string $status, ?string $ownerId, Pagination $page): array
    {
        return $this->contacts->search($caller, $text, $status, $ownerId, $page);
    }

    public function get(CurrentUser $caller, string $id): ContactRecord
    {
        return $this->contacts->find($id, $caller) ?? throw ApiException::notFound();
    }

    /** The caller becomes the owner. The code is taken last, so the queue on the numbering is as short as possible. */
    public function create(CurrentUser $caller, ActorContext $actor, ContactData $data): ContactRecord
    {
        $id = Uuid::v7();
        $this->connection->transactional(function () use ($caller, $actor, $data, $id): void {
            $code = $this->sequences->next('contact');
            $this->contacts->insert($id, $code, $data, $caller->id, $this->clock->now());
            $this->audit->record(
                $actor,
                'create',
                self::ENTITY,
                $id,
                null,
                ['code' => $code] + $data->toArray() + ['owner_id' => $caller->id, 'is_active' => true],
            );
        });

        return $this->get($caller, $id);
    }

    /**
     * Replaces the data of the contact. `$ownerId` null keeps the owner; another one moves the contact to them, which
     * only a caller who reaches other people's contacts may do.
     *
     * @throws ApiException 404, 403 `forbidden` (owner change with scope `own`), or 409 `conflict` (stale version)
     * @throws ValidationException 422 `not_found` (the new owner cannot own contacts) or `out_of_scope`
     */
    public function update(
        CurrentUser $caller,
        ActorContext $actor,
        string $id,
        int $version,
        ContactData $data,
        ?string $ownerId,
    ): ContactRecord {
        $this->connection->transactional(function () use ($caller, $actor, $id, $version, $data, $ownerId): void {
            $current = $this->contacts->find($id, $caller) ?? throw ApiException::notFound();
            $newOwner = $ownerId ?? $current->ownerId;
            if ($newOwner !== $current->ownerId) {
                $this->assertMayMoveTo($caller, $newOwner);
            }

            if (!$this->contacts->update($id, $version, $data, $newOwner, $this->clock->now())) {
                throw ApiException::conflict();
            }

            $before = $current->data->toArray() + ['owner_id' => $current->ownerId];
            $after = $data->toArray() + ['owner_id' => $newOwner];
            $changed = array_keys(array_filter(
                $after,
                static fn (mixed $value, string $field): bool => $value !== $before[$field],
                ARRAY_FILTER_USE_BOTH,
            ));
            if ($changed !== []) {
                $this->audit->record(
                    $actor,
                    'update',
                    self::ENTITY,
                    $id,
                    array_intersect_key($before, array_flip($changed)),
                    array_intersect_key($after, array_flip($changed)),
                );
            }
        });

        return $this->get($caller, $id);
    }

    /**
     * Who the caller can hand a contact to: the same people {@see update()} accepts, so a picker built from this list
     * never offers someone the server would then refuse. Active internal users; with scope `team` only the team, with
     * `all` any of them and with a scope that reaches nobody else, nobody.
     *
     * @return list<array{id: string, name: string}>
     */
    public function ownerOptions(CurrentUser $caller, ?string $text, int $limit): array
    {
        $scope = $caller->scopeFor(ContactRepository::RESOURCE);
        if ($scope === DataScope::All) {
            return $this->contacts->ownerCandidates(null, $text, $limit);
        }
        if ($scope === DataScope::Team) {
            return $this->contacts->ownerCandidates($this->teamOf($caller), $text, $limit);
        }

        return [];
    }

    /** Idempotent. */
    public function deactivate(CurrentUser $caller, ActorContext $actor, string $id): ContactRecord
    {
        return $this->setActive($caller, $actor, $id, false);
    }

    /** Idempotent. */
    public function reactivate(CurrentUser $caller, ActorContext $actor, string $id): ContactRecord
    {
        return $this->setActive($caller, $actor, $id, true);
    }

    private function setActive(CurrentUser $caller, ActorContext $actor, string $id, bool $active): ContactRecord
    {
        $this->connection->transactional(function () use ($caller, $actor, $id, $active): void {
            if (!$this->contacts->lock($id)) {
                throw ApiException::notFound();
            }
            $contact = $this->get($caller, $id);
            if ($contact->isActive() === $active) {
                return;
            }

            $now = $this->clock->now();
            $this->contacts->setDeletedAt($id, $active ? null : $now, $now);
            $this->audit->record(
                $actor,
                $active ? 'reactivate' : 'deactivate',
                self::ENTITY,
                $id,
                ['is_active' => !$active],
                ['is_active' => $active],
            );
        });

        return $this->get($caller, $id);
    }

    /**
     * Moving a contact to another owner needs a scope that reaches other people: `own` cannot, `team` only within the
     * team (so the contact does not leave the caller's sight by accident), `all` anywhere. The new owner must be an
     * active internal user.
     */
    private function assertMayMoveTo(CurrentUser $caller, string $newOwnerId): void
    {
        $scope = $caller->scopeFor(ContactRepository::RESOURCE);
        if ($scope !== DataScope::All && $scope !== DataScope::Team) {
            throw ApiException::forbidden('forbidden', 'This data scope cannot hand a contact to someone else.');
        }
        if (!$this->contacts->ownerCanOwn($newOwnerId)) {
            throw ValidationException::field('owner_id', 'not_found');
        }
        if ($scope === DataScope::Team && !in_array($newOwnerId, $this->teamOf($caller), true)) {
            throw ValidationException::field('owner_id', 'out_of_scope');
        }
    }

    /** @return list<string> the caller and the people of their team; a user built without the team reaches themselves */
    private function teamOf(CurrentUser $caller): array
    {
        return $caller->teamIds === [] ? [$caller->id] : $caller->teamIds;
    }
}
