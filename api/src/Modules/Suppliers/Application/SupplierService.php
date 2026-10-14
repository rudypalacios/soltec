<?php

declare(strict_types=1);

namespace Soltec\Modules\Suppliers\Application;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Settings\Application\SequenceGenerator;
use Soltec\Modules\Suppliers\Domain\SupplierContact;
use Soltec\Modules\Suppliers\Domain\SupplierData;
use Soltec\Modules\Suppliers\Domain\SupplierRecord;
use Soltec\Modules\Suppliers\Persistence\SupplierRepository;

/**
 * Administration of suppliers. They have no owner or data scope; the permissions of the resource are the only gate.
 * The identification is unique and a deactivated supplier keeps it reserved (ADR-0022): to register it again the
 * existing supplier is reactivated. The error never says whose an active one is; for a deactivated one it names it
 * only to whoever may reactivate it. Deactivating never blocks, but takes its active products down with it
 * (ADR-0023).
 */
final class SupplierService
{
    private const ENTITY = 'suppliers';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly SupplierRepository $suppliers,
        private readonly SequenceGenerator $sequences,
        private readonly AuditLogger $audit,
        private readonly DeactivationCascade $cascade,
    ) {
    }

    /** @return array{records: list<SupplierRecord>, total: int} */
    public function list(?string $text, string $status, Pagination $page): array
    {
        return $this->suppliers->search($text, $status, $page);
    }

    /** @return list<array{id: string, code: string, name: string}> */
    public function options(?string $text, int $limit): array
    {
        return $this->suppliers->options($text, $limit);
    }

    public function get(string $id): SupplierRecord
    {
        $supplier = $this->suppliers->find($id) ?? throw ApiException::notFound();

        return $supplier->withDeactivatedProductCount($this->cascade->inactiveCountFor($id));
    }

    /**
     * @throws ValidationException 422 `not_found` (a contact type that does not exist or is inactive)
     * @param bool $mayReactivate whether the caller may reactivate suppliers, so the error can point to the one
     *        that holds the identification
     * @throws ApiException 409 `identification_taken` or `identification_inactive`
     */
    public function create(ActorContext $actor, SupplierData $data, bool $mayReactivate): SupplierRecord
    {
        $id = Uuid::v7();
        $this->takingTheIdentification(function () use ($actor, $data, $id, $mayReactivate): void {
            $this->connection->transactional(function () use ($actor, $data, $id, $mayReactivate): void {
                $this->requireFreeIdentification($data, null, $mayReactivate);
                $this->requireUsableContactTypes($data, []);
                $code = $this->sequences->next('supplier');
                $this->suppliers->insert($id, $code, $data, $this->clock->now());
                $this->audit->record(
                    $actor,
                    'create',
                    self::ENTITY,
                    $id,
                    null,
                    ['code' => $code] + $data->toArray() + ['is_active' => true],
                );
            });
        });

        return $this->get($id);
    }

    /**
     * Replaces the data of the supplier, with its addresses and people as a whole.
     *
     * @throws ApiException 404, 409 `conflict` (stale version), `identification_taken` or `identification_inactive`
     * @throws ValidationException 422 `not_found` (a contact type that does not exist or is inactive)
     */
    public function update(
        ActorContext $actor,
        string $id,
        int $version,
        SupplierData $data,
        bool $mayReactivate,
    ): SupplierRecord {
        $this->takingTheIdentification(function () use ($actor, $id, $version, $data, $mayReactivate): void {
            $this->connection->transactional(function () use ($actor, $id, $version, $data, $mayReactivate): void {
                if (!$this->suppliers->lock($id)) {
                    throw ApiException::notFound();
                }
                $current = $this->get($id);
                $this->requireFreeIdentification($data, $id, $mayReactivate);
                $this->requireUsableContactTypes($data, $this->contactTypeIds($current->data));

                if (!$this->suppliers->update($id, $version, $data, $this->clock->now())) {
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

        return $this->get($id);
    }

    /** Idempotent. */
    public function deactivate(ActorContext $actor, string $id): SupplierRecord
    {
        return $this->setActive($actor, $id, false);
    }

    /**
     * Idempotent.
     *
     * @throws ApiException 409 `identification_taken` when another active supplier uses the identification now
     */
    public function reactivate(ActorContext $actor, string $id): SupplierRecord
    {
        return $this->setActive($actor, $id, true);
    }

    private function setActive(ActorContext $actor, string $id, bool $active): SupplierRecord
    {
        $this->takingTheIdentification(function () use ($actor, $id, $active): void {
            $this->connection->transactional(function () use ($actor, $id, $active): void {
                if (!$this->suppliers->lock($id)) {
                    throw ApiException::notFound();
                }
                if ($this->get($id)->isActive() === $active) {
                    return;
                }

                $now = $this->clock->now();
                $this->suppliers->setDeletedAt($id, $active ? null : $now, $now);
                // Deactivating takes its products down with it; reactivating does not bring them back (ADR-0023).
                $cascaded = $active ? 0 : $this->cascade->deactivateFor($actor, $id);
                $this->audit->record(
                    $actor,
                    $active ? 'reactivate' : 'deactivate',
                    self::ENTITY,
                    $id,
                    ['is_active' => !$active],
                    ['is_active' => $active] + ($active ? [] : ['deactivated_product_count' => $cascaded]),
                );
            });
        });

        return $this->get($id);
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
     * Refuses an identification another supplier holds. A deactivated one counts: it is reactivated, not registered
     * again. Naming it is for whoever may reactivate it; for an active one the message never says whose it is.
     *
     * @throws ApiException 409 `identification_taken` or `identification_inactive`
     */
    private function requireFreeIdentification(SupplierData $data, ?string $exceptId, bool $mayReactivate): void
    {
        if ($data->identification === null) {
            return;
        }
        $holder = $this->suppliers->holderOf($data->identification, $exceptId);
        if ($holder === null) {
            return;
        }
        if ($holder['active']) {
            throw self::taken();
        }

        $pointer = ['inactive_supplier_id' => $holder['id'], 'inactive_supplier_name' => $holder['name']];

        throw ApiException::conflict(
            'identification_inactive',
            'A deactivated supplier already has this identification; reactivate it instead of registering it again.',
            $mayReactivate ? $pointer : [],
        );
    }

    private static function taken(): ApiException
    {
        return ApiException::conflict('identification_taken', 'A supplier with this identification already exists.');
    }

    /**
     * A person is filed under an active type; one the supplier already used keeps working after it is switched off.
     *
     * @param list<string> $alreadyUsed
     * @throws ValidationException 422 `not_found` on `contacts.<n>.contact_type_id`
     */
    private function requireUsableContactTypes(SupplierData $data, array $alreadyUsed): void
    {
        $wanted = array_values(array_unique($this->contactTypeIds($data)));
        $usable = array_merge($alreadyUsed, $this->suppliers->activeContactTypeIds($wanted));

        $errors = [];
        foreach ($data->contacts as $position => $contact) {
            if ($contact->contactTypeId !== null && !in_array($contact->contactTypeId, $usable, true)) {
                $errors[] = ['field' => sprintf('contacts.%d.contact_type_id', $position), 'code' => 'not_found'];
            }
        }
        if ($errors !== []) {
            throw new ValidationException($errors);
        }
    }

    /** @return list<string> */
    private function contactTypeIds(SupplierData $data): array
    {
        return array_values(array_filter(
            array_map(static fn (SupplierContact $c): ?string => $c->contactTypeId, $data->contacts),
            static fn (?string $id): bool => $id !== null,
        ));
    }
}
