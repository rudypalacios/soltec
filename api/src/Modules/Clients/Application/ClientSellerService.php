<?php

declare(strict_types=1);

namespace Soltec\Modules\Clients\Application;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Auth\DataScope;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Clients\Domain\ClientRecord;
use Soltec\Modules\Clients\Persistence\ClientContactRepository;
use Soltec\Modules\Clients\Persistence\ClientRepository;
use Soltec\Modules\Clients\Persistence\ClientSellerRepository;
use Soltec\Modules\Contacts\Persistence\ContactRepository;

/**
 * The advisers of a client (ADR-0025). A client always has exactly one responsible adviser; a prospect has only that
 * one and a customer may have several. Who administers them: the responsible adviser, and whoever reaches the client
 * with a `team` or `all` scope. An adviser who is linked does not remove another one. Handing a client over takes
 * along the people of the adviser who leaves that are linked to it and to no other client.
 */
final class ClientSellerService
{
    private const ENTITY = 'clients';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly ClientService $clientService,
        private readonly ClientRepository $clients,
        private readonly ClientSellerRepository $sellers,
        private readonly ClientContactRepository $links,
        private readonly ContactRepository $contacts,
        private readonly AuditLogger $audit,
    ) {
    }

    /**
     * Who the caller can make an adviser: the same people the other operations accept, so a picker built from this
     * list never offers someone the server would then refuse. Active internal users; with scope `all` any of them,
     * with `team` the team, and with `own` only the caller (nobody else to hand a client to).
     *
     * @return list<array{id: string, name: string}>
     */
    public function options(CurrentUser $caller, ?string $text, int $limit): array
    {
        return $this->contacts->ownerCandidates($this->reachableIds($caller), $text, $limit);
    }

    /**
     * Adds an adviser to a customer. Idempotent.
     *
     * @throws ApiException 403, 404, or 409 `prospect_single_seller`
     * @throws ValidationException 422 `not_found` (the user cannot be an adviser)
     */
    public function add(CurrentUser $caller, ActorContext $actor, string $clientId, string $userId): ClientRecord
    {
        $this->inTheClient($caller, $clientId, function (ClientRecord $client) use ($caller, $actor, $userId): void {
            if (!$client->isCustomer()) {
                throw ApiException::conflict(
                    'prospect_single_seller',
                    'A prospect has a single adviser; convert it to a customer to share it.',
                );
            }
            $this->requireAssignable($caller, $userId, 'user_id');
            if ($this->sellers->isSeller($client->id, $userId)) {
                return;
            }

            $this->sellers->add($client->id, $userId, false);
            $this->audit->record($actor, 'seller_add', self::ENTITY, $client->id, null, ['user_id' => $userId]);
        });

        return $this->clientService->get($caller, $clientId);
    }

    /**
     * Removes an adviser. The responsible one is not removed: another takes the place first.
     *
     * @throws ApiException 403, 404, or 409 `responsible_required`
     */
    public function remove(CurrentUser $caller, ActorContext $actor, string $clientId, string $userId): ClientRecord
    {
        $this->inTheClient($caller, $clientId, function (ClientRecord $client) use ($actor, $userId): void {
            if (!$this->sellers->isSeller($client->id, $userId)) {
                throw ApiException::notFound();
            }
            if ($this->sellers->isResponsible($client->id, $userId)) {
                throw ApiException::conflict(
                    'responsible_required',
                    'A client always has a responsible adviser; make another one responsible before removing this one.',
                );
            }

            $this->sellers->remove($client->id, $userId);
            $this->audit->record($actor, 'seller_remove', self::ENTITY, $client->id, ['user_id' => $userId], null);
        });

        return $this->clientService->get($caller, $clientId);
    }

    /**
     * Makes an adviser of the client the responsible one. Idempotent.
     *
     * @throws ApiException 403 or 404
     * @throws ValidationException 422 `not_found` (the user is not an adviser of the client)
     */
    public function makeResponsible(
        CurrentUser $caller,
        ActorContext $actor,
        string $clientId,
        string $userId,
    ): ClientRecord {
        $this->inTheClient($caller, $clientId, function (ClientRecord $client) use ($actor, $userId): void {
            if (!$this->sellers->isSeller($client->id, $userId)) {
                throw ValidationException::field('user_id', 'not_found');
            }
            if ($this->sellers->isResponsible($client->id, $userId)) {
                return;
            }

            $this->sellers->setResponsible($client->id, $userId);
            $this->audit->record(
                $actor,
                'responsible_change',
                self::ENTITY,
                $client->id,
                ['responsible_id' => $client->responsible['id'] ?? null],
                ['responsible_id' => $userId],
            );
        });

        return $this->clientService->get($caller, $clientId);
    }

    /**
     * Replaces one adviser of the client with another user, who is the responsible one if the first was.
     *
     * @return array{client: ClientRecord, contacts_moved: int, contacts_kept: int}
     * @throws ApiException 403 or 404
     * @throws ValidationException 422 `not_found` (`from_user_id` is not an adviser of the client, or `to_user_id`
     *         cannot be one) or `same_user`
     */
    public function reassign(
        CurrentUser $caller,
        ActorContext $actor,
        string $clientId,
        string $fromUserId,
        string $toUserId,
        bool $moveContacts,
    ): array {
        $this->requireDifferent($fromUserId, $toUserId);
        $totals = ['moved' => 0, 'kept' => 0];
        $this->inTheClient(
            $caller,
            $clientId,
            function (ClientRecord $client) use (
                $caller,
                $actor,
                $fromUserId,
                $toUserId,
                $moveContacts,
                &$totals,
            ): void {
                $this->requireAssignable($caller, $toUserId, 'to_user_id');
                $this->handOver($actor, [$client->id], $fromUserId, $toUserId, $moveContacts, $totals);
            },
        );

        return [
            'client' => $this->clientService->get($caller, $clientId),
            'contacts_moved' => $totals['moved'],
            'contacts_kept' => $totals['kept'],
        ];
    }

    /**
     * Hands over every client of an adviser that the caller reaches, with their people. It needs a scope that
     * reaches other people's clients.
     *
     * @return array{clients_reassigned: int, contacts_moved: int, contacts_kept: int}
     * @throws ApiException 403 (scope `own`)
     * @throws ValidationException 422 `not_found` or `same_user`
     */
    public function reassignPortfolio(
        CurrentUser $caller,
        ActorContext $actor,
        string $fromUserId,
        string $toUserId,
        bool $moveContacts,
    ): array {
        $this->requireDifferent($fromUserId, $toUserId);
        if (!$this->administersOthers($caller)) {
            throw ApiException::forbidden('forbidden', 'This data scope cannot hand over other advisers\' clients.');
        }

        $totals = ['moved' => 0, 'kept' => 0];
        $count = 0;
        $this->connection->transactional(
            function () use ($caller, $actor, $fromUserId, $toUserId, $moveContacts, &$totals, &$count): void {
                $this->requireAssignable($caller, $toUserId, 'to_user_id');
                $ids = $this->sellers->clientIdsOf($caller, $fromUserId);
                foreach ($ids as $id) {
                    $this->clients->lock($id);
                }
                if ($ids !== []) {
                    $this->handOver($actor, $ids, $fromUserId, $toUserId, $moveContacts, $totals);
                }
                $count = count($ids);
            },
        );

        return [
            'clients_reassigned' => $count,
            'contacts_moved' => $totals['moved'],
            'contacts_kept' => $totals['kept'],
        ];
    }

    /**
     * Swaps the adviser in each client and moves the people that go with them.
     *
     * @param non-empty-list<string> $clientIds
     * @param array{moved: int, kept: int} $totals
     * @throws ValidationException 422 `not_found` when the first user is not an adviser of one of the clients
     */
    private function handOver(
        ActorContext $actor,
        array $clientIds,
        string $fromUserId,
        string $toUserId,
        bool $moveContacts,
        array &$totals,
    ): void {
        foreach ($clientIds as $clientId) {
            if (!$this->sellers->isSeller($clientId, $fromUserId)) {
                throw ValidationException::field('from_user_id', 'not_found');
            }
            $wasResponsible = $this->sellers->isResponsible($clientId, $fromUserId);
            if ($this->sellers->isSeller($clientId, $toUserId)) {
                $this->sellers->remove($clientId, $fromUserId);
                if ($wasResponsible) {
                    $this->sellers->setResponsible($clientId, $toUserId);
                }
            } else {
                $this->sellers->replace($clientId, $fromUserId, $toUserId);
            }
            $this->audit->record(
                $actor,
                'reassign',
                self::ENTITY,
                $clientId,
                ['user_id' => $fromUserId],
                ['user_id' => $toUserId],
            );
        }

        if (!$moveContacts) {
            return;
        }
        $people = $this->links->handover($clientIds, $fromUserId);
        $totals['kept'] += $people['kept'];
        if ($people['movable'] === []) {
            return;
        }

        $this->contacts->transferOwnership($people['movable'], $toUserId, $this->clock->now());
        $this->audit->recordMany($actor, 'update', 'contacts', array_map(
            static fn (string $id): array => [
                'id' => $id,
                'before' => ['owner_id' => $fromUserId],
                'after' => ['owner_id' => $toUserId],
            ],
            $people['movable'],
        ));
        $totals['moved'] += count($people['movable']);
    }

    /**
     * Runs a change on the advisers of a client inside a transaction, with the client locked and the caller known to
     * be allowed to administer its advisers.
     *
     * @param callable(ClientRecord): void $change
     * @throws ApiException 404 (the client is outside the caller's reach) or 403
     */
    private function inTheClient(CurrentUser $caller, string $clientId, callable $change): void
    {
        $this->connection->transactional(function () use ($caller, $clientId, $change): void {
            if (!$this->clients->lock($clientId)) {
                throw ApiException::notFound();
            }
            $client = $this->clients->find($clientId, $caller) ?? throw ApiException::notFound();
            if (!$this->administersOthers($caller) && !$this->sellers->isResponsible($clientId, $caller->id)) {
                throw ApiException::forbidden('forbidden', 'Only the responsible adviser can change the advisers.');
            }

            $change($client);
        });
    }

    private function administersOthers(CurrentUser $caller): bool
    {
        $scope = $caller->scopeFor(ClientRepository::RESOURCE);

        return $scope === DataScope::All || $scope === DataScope::Team;
    }

    /**
     * @throws ValidationException 422 `not_found` when the user is not an active internal user, `out_of_scope` when
     *         they are outside the people the caller's scope reaches
     */
    private function requireAssignable(CurrentUser $caller, string $userId, string $field): void
    {
        if (!$this->contacts->ownerCanOwn($userId)) {
            throw ValidationException::field($field, 'not_found');
        }
        $reachable = $this->reachableIds($caller);
        if ($reachable !== null && !in_array($userId, $reachable, true)) {
            throw ValidationException::field($field, 'out_of_scope');
        }
    }

    /**
     * The people the caller can hand a client to: anyone with scope `all` (null), the team with `team` and only the
     * caller with `own`. A user built without the team reaches themselves.
     *
     * @return list<string>|null
     */
    private function reachableIds(CurrentUser $caller): ?array
    {
        $scope = $caller->scopeFor(ClientRepository::RESOURCE);
        if ($scope === DataScope::All) {
            return null;
        }
        if ($scope === DataScope::Team && $caller->teamIds !== []) {
            return $caller->teamIds;
        }

        return [$caller->id];
    }

    /** @throws ValidationException 422 `same_user` */
    private function requireDifferent(string $fromUserId, string $toUserId): void
    {
        if ($fromUserId === $toUserId) {
            throw ValidationException::field('to_user_id', 'same_user');
        }
    }
}
