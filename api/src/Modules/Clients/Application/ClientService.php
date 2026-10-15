<?php

declare(strict_types=1);

namespace Soltec\Modules\Clients\Application;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Soltec\Kernel\Address;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Identification;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Clients\Domain\BillingProfile;
use Soltec\Modules\Clients\Domain\ClientData;
use Soltec\Modules\Clients\Domain\ClientFilters;
use Soltec\Modules\Clients\Domain\ClientRecord;
use Soltec\Modules\Clients\Persistence\ClientRepository;
use Soltec\Modules\Clients\Persistence\ClientSellerRepository;
use Soltec\Modules\Settings\Application\SequenceGenerator;

/**
 * Administration of clients. The data scope of the resource, decided by the advisers of each client, says whose
 * clients a user reaches; one outside it does not exist for them (404). A prospect is created by an adviser and
 * becomes a customer by hand (`convert`) until the Cotizador does it (Hito 4).
 *
 * The identification is unique and a deactivated client keeps it reserved (ADR-0022): to register it again the
 * existing client is reactivated. The error never says whose an active one is, and names a deactivated one only to
 * whoever may reactivate it and already reaches it (ADR-0025), so it cannot be used to find out who works with a
 * company.
 */
final class ClientService
{
    private const ENTITY = 'clients';
    private const SIMILAR_LIMIT = 5;

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly ClientRepository $clients,
        private readonly ClientSellerRepository $sellers,
        private readonly SequenceGenerator $sequences,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return array{records: list<ClientRecord>, total: int} */
    public function list(CurrentUser $caller, ClientFilters $filters, Pagination $page): array
    {
        return $this->clients->search($caller, $filters, $page);
    }

    public function get(CurrentUser $caller, string $id): ClientRecord
    {
        $client = $this->clients->find($id, $caller) ?? throw ApiException::notFound();

        return $this->clients->withContacts($client, $caller, $caller->can('contacts', 'view'));
    }

    /**
     * Clients within the caller's reach whose name resembles what is being typed.
     *
     * @return list<array{id: string, code: string, name: string}>
     */
    public function similar(CurrentUser $caller, string $name): array
    {
        return mb_strlen($name) < 3 ? [] : $this->clients->similarNames($caller, $name, self::SIMILAR_LIMIT);
    }

    /**
     * Creates a prospect. The caller becomes its only adviser and the responsible one.
     *
     * @throws ValidationException 422 `not_found` (a catalog value that does not exist or is inactive)
     * @throws ApiException 409 `identification_taken` or `identification_inactive`
     */
    public function create(CurrentUser $caller, ActorContext $actor, ClientData $data): ClientRecord
    {
        $id = Uuid::v7();
        $this->takingTheIdentification(function () use ($caller, $actor, $data, $id): void {
            $this->connection->transactional(function () use ($caller, $actor, $data, $id): void {
                $this->requireFreeIdentification($caller, $data->identification, null);
                $this->requireActiveValues($data, null);
                $code = $this->sequences->next('client');
                $this->clients->insert($id, $code, $data, $this->clock->now());
                $this->sellers->add($id, $caller->id, true);
                $this->audit->record(
                    $actor,
                    'create',
                    self::ENTITY,
                    $id,
                    null,
                    ['code' => $code, 'type' => 'prospect'] + $data->toArray()
                    + ['responsible_id' => $caller->id, 'is_active' => true],
                );
            });
        });

        return $this->get($caller, $id);
    }

    /**
     * Replaces the data of the client, with its addresses and billing profile as a whole. A customer needs a billing
     * profile and a prospect cannot have one.
     *
     * @throws ApiException 404, 409 `conflict` (stale version), `identification_taken` or `identification_inactive`
     * @throws ValidationException 422 `not_found`, or `required` / `not_applicable` on `billing_profile`
     */
    public function update(
        CurrentUser $caller,
        ActorContext $actor,
        string $id,
        int $version,
        ClientData $data,
    ): ClientRecord {
        $this->takingTheIdentification(function () use ($caller, $actor, $id, $version, $data): void {
            $this->connection->transactional(function () use ($caller, $actor, $id, $version, $data): void {
                if (!$this->clients->lock($id)) {
                    throw ApiException::notFound();
                }
                $current = $this->clients->find($id, $caller) ?? throw ApiException::notFound();
                $this->requireBillingFitsTheType($current, $data);
                $this->requireFreeIdentification($caller, $data->identification, $id);
                $this->requireActiveValues($data, $current);

                if (!$this->clients->update($id, $version, $data, $this->clock->now())) {
                    throw ApiException::conflict();
                }

                $before = $current->data->toArray();
                $after = $data->toArray();
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
        });

        return $this->get($caller, $id);
    }

    /**
     * Turns a prospect into a customer: the identification becomes required (a type, which may be `none`) and the
     * billing profile is created.
     *
     * @throws ApiException 404, 409 `conflict` (stale version), `already_customer`, `client_inactive`,
     *         `identification_taken` or `identification_inactive`
     * @throws ValidationException 422 `not_found` on the tax regime or the payment method
     */
    public function convert(
        CurrentUser $caller,
        ActorContext $actor,
        string $id,
        int $version,
        string $identificationType,
        ?string $identification,
        BillingProfile $billing,
    ): ClientRecord {
        $this->takingTheIdentification(function () use (
            $caller,
            $actor,
            $id,
            $version,
            $identificationType,
            $identification,
            $billing,
        ): void {
            $this->connection->transactional(function () use (
                $caller,
                $actor,
                $id,
                $version,
                $identificationType,
                $identification,
                $billing,
            ): void {
                $this->convertLocked($caller, $actor, $id, $version, $identificationType, $identification, $billing);
            });
        });

        return $this->get($caller, $id);
    }

    /** Idempotent. */
    public function deactivate(CurrentUser $caller, ActorContext $actor, string $id): ClientRecord
    {
        return $this->setActive($caller, $actor, $id, false);
    }

    /**
     * Idempotent.
     *
     * @throws ApiException 409 `identification_taken` when another active client uses the identification now
     */
    public function reactivate(CurrentUser $caller, ActorContext $actor, string $id): ClientRecord
    {
        return $this->setActive($caller, $actor, $id, true);
    }

    /**
     * What the signed-in external user may see of their own client.
     *
     * @return array<string, mixed> the `ClientProfile` schema of the contract
     */
    public function profileOf(CurrentUser $caller): array
    {
        $clientId = $caller->type === 'external' ? $this->clients->clientIdOfUser($caller->id) : null;
        $profile = $clientId === null ? null : $this->clients->profileOf($clientId);
        if ($profile === null) {
            throw ApiException::notFound();
        }

        $identification = $profile['identification'];

        return [
            'id' => $profile['id'],
            'name' => $profile['name'],
            'legal_name' => $profile['legal_name'],
            'identification_type' => $profile['identification_type'],
            'identification' => $identification === null
                ? null
                : Identification::display($profile['identification_type'], $identification),
            'tax_regime' => $profile['tax_regime'],
            'addresses' => array_map(static fn (Address $a): array => $a->toArray(), $profile['addresses']),
        ];
    }

    /** The body of {@see convert()}, inside its transaction. */
    private function convertLocked(
        CurrentUser $caller,
        ActorContext $actor,
        string $id,
        int $version,
        string $identificationType,
        ?string $identification,
        BillingProfile $billing,
    ): void {
        if (!$this->clients->lock($id)) {
            throw ApiException::notFound();
        }
        $current = $this->clients->find($id, $caller) ?? throw ApiException::notFound();
        if ($current->isCustomer()) {
            throw ApiException::conflict('already_customer', 'The client is already a customer.');
        }
        if (!$current->isActive()) {
            throw ApiException::conflict('client_inactive', 'A deactivated client cannot be converted.');
        }
        $this->requireFreeIdentification($caller, $identification, $id);
        $this->requireActiveValues($current->data, $current, $billing);

        $now = $this->clock->now();
        if (!$this->clients->convert($id, $version, $identificationType, $identification, $billing, $now)) {
            throw ApiException::conflict();
        }

        $this->audit->record(
            $actor,
            'convert',
            self::ENTITY,
            $id,
            [
                'type' => 'prospect',
                'identification_type' => $current->data->identificationType,
                'identification' => $current->data->identification,
            ],
            [
                'type' => 'customer',
                'identification_type' => $identificationType,
                'identification' => $identification,
                'billing_profile' => $billing->toArray(),
            ],
        );
    }

    private function setActive(CurrentUser $caller, ActorContext $actor, string $id, bool $active): ClientRecord
    {
        $this->takingTheIdentification(function () use ($caller, $actor, $id, $active): void {
            $this->connection->transactional(function () use ($caller, $actor, $id, $active): void {
                if (!$this->clients->lock($id)) {
                    throw ApiException::notFound();
                }
                $client = $this->clients->find($id, $caller) ?? throw ApiException::notFound();
                if ($client->isActive() === $active) {
                    return;
                }

                $now = $this->clock->now();
                $this->clients->setDeletedAt($id, $active ? null : $now, $now);
                $this->audit->record(
                    $actor,
                    $active ? 'reactivate' : 'deactivate',
                    self::ENTITY,
                    $id,
                    ['is_active' => !$active],
                    ['is_active' => $active],
                );
            });
        });

        return $this->get($caller, $id);
    }

    /** Turns the unique index on the identification (a race past the check) into the fixed message of ADR-0022. */
    private function takingTheIdentification(callable $work): void
    {
        try {
            $work();
        } catch (UniqueConstraintViolationException) {
            throw self::taken();
        }
    }

    /**
     * Refuses an identification another client holds. A deactivated one counts: it is reactivated, not registered
     * again. The error names it only to a caller who may reactivate clients and already reaches that one.
     *
     * @throws ApiException 409 `identification_taken` or `identification_inactive`
     */
    private function requireFreeIdentification(CurrentUser $caller, ?string $identification, ?string $exceptId): void
    {
        if ($identification === null) {
            return;
        }
        $holder = $this->clients->holderOf($identification, $exceptId);
        if ($holder === null) {
            return;
        }
        if ($holder['active']) {
            throw self::taken();
        }

        $pointer = [];
        if ($caller->can(ClientRepository::RESOURCE, 'deactivate')) {
            $reachable = $this->clients->find($holder['id'], $caller);
            if ($reachable !== null) {
                $pointer = ['inactive_client_id' => $reachable->id, 'inactive_client_name' => $reachable->data->name];
            }
        }

        throw ApiException::conflict(
            'identification_inactive',
            'A deactivated client already has this identification; reactivate it instead of registering it again.',
            $pointer,
        );
    }

    private static function taken(): ApiException
    {
        return ApiException::conflict('identification_taken', 'A client with this identification already exists.');
    }

    /**
     * @throws ValidationException 422 `required` when a customer has no billing profile, `not_applicable` when a
     *         prospect has one
     */
    private function requireBillingFitsTheType(ClientRecord $current, ClientData $data): void
    {
        if ($current->isCustomer() && $data->billing === null) {
            throw ValidationException::field('billing_profile', 'required');
        }
        if (!$current->isCustomer() && $data->billing !== null) {
            throw ValidationException::field('billing_profile', 'not_applicable');
        }
    }

    /**
     * Every catalog value must be active, except one the client already had (a value switched off later keeps
     * working for the clients that use it, ADR-0023).
     *
     * @param ClientRecord|null $current the client as stored, null when it is being created
     * @param BillingProfile|null $billing the profile being created by a conversion; otherwise the one in `$data`
     * @throws ValidationException 422 `not_found` on each field with a value that cannot be used
     */
    private function requireActiveValues(
        ClientData $data,
        ?ClientRecord $current,
        ?BillingProfile $billing = null,
    ): void {
        $billing ??= $data->billing;
        $fields = [
            ['status_id', 'client_statuses', $data->statusId, $current?->data->statusId],
            ['segment_id', 'segments', $data->segmentId, $current?->data->segmentId],
            ['area_id', 'areas', $data->areaId, $current?->data->areaId],
            ['margin_level_id', 'margin_levels', $data->marginLevelId, $current?->data->marginLevelId],
            [
                'billing_profile.tax_regime_id',
                'tax_regimes',
                $billing?->taxRegimeId,
                $current?->data->billing?->taxRegimeId,
            ],
            [
                'billing_profile.payment_method_id',
                'payment_methods',
                $billing?->paymentMethodId,
                $current?->data->billing?->paymentMethodId,
            ],
        ];

        $errors = [];
        foreach ($fields as [$field, $table, $wanted, $already]) {
            if ($wanted === null || $wanted === $already) {
                continue;
            }
            if ($this->clients->activeIds($table, [$wanted]) === []) {
                $errors[] = ['field' => $field, 'code' => 'not_found'];
            }
        }
        if ($errors !== []) {
            throw new ValidationException($errors);
        }
    }
}
