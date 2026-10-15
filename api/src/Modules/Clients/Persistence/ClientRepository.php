<?php

declare(strict_types=1);

namespace Soltec\Modules\Clients\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Query\QueryBuilder;
use LogicException;
use Soltec\Kernel\Address;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Auth\ScopedQuery;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Clients\Domain\BillingProfile;
use Soltec\Modules\Clients\Domain\ClientData;
use Soltec\Modules\Clients\Domain\ClientFilters;
use Soltec\Modules\Clients\Domain\ClientRecord;

/**
 * Reads and writes `clients` with their addresses and billing profile. Every read takes the reader and applies the
 * data scope of the resource, which is decided by the client's advisers (ADR-0025): a client outside the scope does
 * not exist for them. Ids cross the database as hex (see Uuid).
 */
final class ClientRepository
{
    public const RESOURCE = 'clients';

    /** The catalog tables a client points at; the keys are what {@see activeIds()} accepts. */
    private const LOOKUPS = [
        'client_statuses', 'segments', 'areas', 'margin_levels', 'tax_regimes', 'payment_methods', 'contact_types',
    ];

    private const COLUMNS = 'LOWER(HEX(c.id)) AS id, c.code, c.type, c.name, c.identification_type, '
        . 'c.identification, c.converted_at, c.created_at, c.updated_at, c.version, c.deleted_at, '
        . 'LOWER(HEX(c.status_id)) AS status_id, st.name AS status_name, st.color AS status_color, '
        . 'LOWER(HEX(c.segment_id)) AS segment_id, sg.name AS segment_name, '
        . 'LOWER(HEX(c.area_id)) AS area_id, ar.name AS area_name, '
        . 'LOWER(HEX(c.margin_level_id)) AS margin_level_id, ml.name AS margin_level_name, '
        . 'LOWER(HEX(rs.user_id)) AS responsible_id, ru.name AS responsible_name, '
        . '(SELECT COUNT(*) FROM client_sellers n WHERE n.client_id = c.id) AS seller_count';

    public function __construct(private readonly Connection $connection)
    {
    }

    /** One client with its addresses, billing profile and advisers, or null. Contacts are read apart. */
    public function find(string $id, CurrentUser $reader): ?ClientRecord
    {
        $row = $this->base($reader, self::COLUMNS)
            ->andWhere('c.id = UNHEX(:id)')
            ->setParameter('id', Uuid::toHex($id))
            ->executeQuery()
            ->fetchAssociative();
        if ($row === false) {
            return null;
        }

        $billing = $this->billingOf($id);

        return $this->hydrate(
            $row,
            $this->addressesOf($id),
            $billing['profile'],
            $billing['refs'],
            $this->sellersOf($id),
        );
    }

    /** The same client with the people the reader may see linked to it. */
    public function withContacts(ClientRecord $client, CurrentUser $reader, bool $mayReadContacts): ClientRecord
    {
        return new ClientRecord(
            $client->id,
            $client->code,
            $client->type,
            $client->data,
            $client->refs,
            $client->convertedAt,
            $client->createdAt,
            $client->updatedAt,
            $client->version,
            $client->deletedAt,
            $client->responsible,
            $client->sellerCount,
            $client->sellers,
            $mayReadContacts ? $this->contactsOf($client->id, $reader) : [],
        );
    }

    /** Locks the row until the end of the transaction. */
    public function lock(string $id): bool
    {
        return $this->connection->fetchOne(
            'SELECT 1 FROM clients WHERE id = UNHEX(:id) FOR UPDATE',
            ['id' => Uuid::toHex($id)],
        ) !== false;
    }

    /** @return array{records: list<ClientRecord>, total: int} */
    public function search(CurrentUser $reader, ClientFilters $filters, Pagination $page): array
    {
        $filtered = function (QueryBuilder $query) use ($filters): QueryBuilder {
            if ($filters->status === 'active') {
                $query->andWhere('c.deleted_at IS NULL');
            } elseif ($filters->status === 'inactive') {
                $query->andWhere('c.deleted_at IS NOT NULL');
            }
            foreach (
                [
                'type' => ['c.type = :type', $filters->type],
                'status' => ['c.status_id = UNHEX(:status)', $filters->statusId],
                'segment' => ['c.segment_id = UNHEX(:segment)', $filters->segmentId],
                ] as $name => [$condition, $value]
            ) {
                if ($value !== null) {
                    $query->andWhere($condition)
                        ->setParameter($name, $name === 'type' ? $value : Uuid::toHex($value));
                }
            }
            if ($filters->sellerId !== null) {
                $query->andWhere(
                    'EXISTS (SELECT 1 FROM client_sellers f WHERE f.client_id = c.id AND f.user_id = UNHEX(:seller))',
                )->setParameter('seller', Uuid::toHex($filters->sellerId));
            }
            if ($filters->text !== null && $filters->text !== '') {
                $query->leftJoin('c', 'client_billing_profiles', 'bp', 'bp.client_id = c.id')
                    ->andWhere(
                        '(c.name LIKE :text OR c.code LIKE :text OR bp.legal_name LIKE :text '
                        . 'OR c.identification LIKE :identification)',
                    )
                    ->setParameter('text', '%' . addcslashes($filters->text, '%_\\') . '%')
                    ->setParameter(
                        'identification',
                        '%' . addcslashes(strtoupper(str_replace(['-', ' '], '', $filters->text)), '%_\\') . '%',
                    );
            }

            return $query;
        };

        $total = $filtered($this->base($reader, 'COUNT(*)'))->executeQuery()->fetchOne();
        $rows = $filtered($this->base($reader, self::COLUMNS))
            ->orderBy('c.name')
            ->addOrderBy('c.id')
            ->setFirstResult($page->offset())
            ->setMaxResults($page->perPage)
            ->executeQuery()
            ->fetchAllAssociative();

        return [
            'records' => array_map(fn (array $row): ClientRecord => $this->hydrate($row, [], null, [], null), $rows),
            'total' => is_numeric($total) ? (int) $total : 0,
        ];
    }

    /**
     * Clients of the reader whose name resembles what is being typed, to warn of a duplicate before it is created.
     * Only inside the reader's scope: it must not reveal who else works with a company (ADR-0022).
     *
     * @return list<array{id: string, code: string, name: string}>
     */
    public function similarNames(CurrentUser $reader, string $text, int $limit): array
    {
        $rows = $this->base($reader, 'LOWER(HEX(c.id)) AS id, c.code, c.name')
            ->andWhere('c.name LIKE :text')
            ->setParameter('text', '%' . addcslashes($text, '%_\\') . '%')
            ->orderBy('c.name')
            ->addOrderBy('c.id')
            ->setMaxResults($limit)
            ->executeQuery()
            ->fetchAllAssociative();

        return array_map(static fn (array $row): array => [
            'id' => Uuid::fromHex(Row::string($row, 'id')),
            'code' => Row::string($row, 'code'),
            'name' => Row::string($row, 'name'),
        ], $rows);
    }

    /** @throws \Doctrine\DBAL\Exception\UniqueConstraintViolationException when the identification is taken */
    public function insert(string $id, string $code, ClientData $data, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            "INSERT INTO clients (id, code, type, name, identification_type, identification, status_id, segment_id, "
            . "area_id, margin_level_id, created_at, updated_at) VALUES (UNHEX(:id), :code, 'prospect', :name, "
            . ':identification_type, :identification, UNHEX(:status_id), UNHEX(:segment_id), UNHEX(:area_id), '
            . 'UNHEX(:margin_level_id), :now, :now)',
            ['id' => Uuid::toHex($id), 'code' => $code, 'now' => Timestamps::toDb($now)] + $this->columns($data),
        );
        $this->replaceAddresses($id, $data);
    }

    /**
     * @return bool false when the version is stale or the client does not exist
     * @throws \Doctrine\DBAL\Exception\UniqueConstraintViolationException when the identification is taken
     */
    public function update(string $id, int $version, ClientData $data, DateTimeImmutable $now): bool
    {
        $changed = $this->connection->executeStatement(
            'UPDATE clients SET name = :name, identification_type = :identification_type, '
            . 'identification = :identification, status_id = UNHEX(:status_id), segment_id = UNHEX(:segment_id), '
            . 'area_id = UNHEX(:area_id), margin_level_id = UNHEX(:margin_level_id), updated_at = :now, '
            . 'version = version + 1 WHERE id = UNHEX(:id) AND version = :version',
            ['id' => Uuid::toHex($id), 'version' => $version, 'now' => Timestamps::toDb($now)]
            + $this->columns($data),
        ) === 1;
        if ($changed) {
            $this->replaceAddresses($id, $data);
            $this->replaceBilling($id, $data->billing);
        }

        return $changed;
    }

    /**
     * Turns a prospect into a customer, with the identification and the billing profile it now needs.
     *
     * @return bool false when the version is stale or the client is not a prospect
     * @throws \Doctrine\DBAL\Exception\UniqueConstraintViolationException when the identification is taken
     */
    public function convert(
        string $id,
        int $version,
        string $identificationType,
        ?string $identification,
        BillingProfile $billing,
        DateTimeImmutable $now,
    ): bool {
        $changed = $this->connection->executeStatement(
            "UPDATE clients SET type = 'customer', identification_type = :identification_type, "
            . 'identification = :identification, converted_at = :now, updated_at = :now, version = version + 1 '
            . "WHERE id = UNHEX(:id) AND version = :version AND type = 'prospect'",
            [
                'id' => Uuid::toHex($id),
                'version' => $version,
                'now' => Timestamps::toDb($now),
                'identification_type' => $identificationType,
                'identification' => $identification,
            ],
        ) === 1;
        if ($changed) {
            $this->replaceBilling($id, $billing);
        }

        return $changed;
    }

    /**
     * Deactivates (a date) or reactivates (null).
     *
     * @throws \Doctrine\DBAL\Exception\UniqueConstraintViolationException when reactivating and another active
     *         client took the identification meanwhile
     */
    public function setDeletedAt(string $id, ?DateTimeImmutable $deletedAt, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE clients SET deleted_at = :deleted_at, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id)',
            [
                'id' => Uuid::toHex($id),
                'deleted_at' => $deletedAt === null ? null : Timestamps::toDb($deletedAt),
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /**
     * The other client that holds an identification, an active one first. A deactivated client keeps its
     * identification reserved, so it is found here too (the unique index alone only covers the active ones).
     *
     * @param string|null $exceptId the client being edited, who never conflicts with itself
     * @return array{id: string, active: bool}|null
     */
    public function holderOf(string $identification, ?string $exceptId): ?array
    {
        $row = $this->connection->fetchAssociative(
            'SELECT LOWER(HEX(id)) AS id, deleted_at FROM clients WHERE identification = :identification '
            . "AND identification_type <> 'none' AND (:except IS NULL OR id <> UNHEX(:except)) "
            . 'ORDER BY deleted_at IS NULL DESC, created_at LIMIT 1',
            ['identification' => $identification, 'except' => $exceptId === null ? null : Uuid::toHex($exceptId)],
        );
        if ($row === false) {
            return null;
        }

        return [
            'id' => Uuid::fromHex(Row::string($row, 'id')),
            'active' => Row::nullableString($row, 'deleted_at') === null,
        ];
    }

    /**
     * Which of the values of a catalog are active, so a client is not filed under one that was switched off.
     *
     * @param string $table one of the catalogs a client points at
     * @param list<string> $ids
     * @return list<string> the ids that are active
     */
    public function activeIds(string $table, array $ids): array
    {
        if (!in_array($table, self::LOOKUPS, true)) {
            throw new LogicException(sprintf('"%s" is not a catalog of clients.', $table));
        }
        if ($ids === []) {
            return [];
        }
        $query = $this->connection->createQueryBuilder()
            ->select('LOWER(HEX(t.id)) AS id')
            ->from($table, 't')
            ->where('t.deleted_at IS NULL');
        $placeholders = [];
        foreach ($ids as $index => $id) {
            $placeholders[] = sprintf('UNHEX(:value_%d)', $index);
            $query->setParameter('value_' . $index, Uuid::toHex($id));
        }
        $query->andWhere(sprintf('t.id IN (%s)', implode(', ', $placeholders)));

        return array_map(
            static fn (array $row): string => Uuid::fromHex(Row::string($row, 'id')),
            $query->executeQuery()->fetchAllAssociative(),
        );
    }

    /** The client an external user belongs to, or null (an internal user, or one without a client). */
    public function clientIdOfUser(string $userId): ?string
    {
        $id = $this->connection->fetchOne(
            'SELECT LOWER(HEX(client_id)) FROM users WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($userId)],
        );

        return is_string($id) && $id !== '' ? Uuid::fromHex($id) : null;
    }

    /**
     * What a client sees of itself in the portal (ADR-0025): name, identification, tax regime and addresses. Not the
     * status, the segment, the margin level, the advisers or the contacts, and no scope applies: the id comes from
     * the signed-in user's own account, never from the request. An inactive client has nothing to show.
     *
     * @return array{
     *     id: string, name: string, legal_name: string|null, identification_type: string,
     *     identification: string|null, tax_regime: array{id: string, name: string}|null, addresses: list<Address>
     * }|null
     */
    public function profileOf(string $clientId): ?array
    {
        $row = $this->connection->fetchAssociative(
            'SELECT c.name, c.identification_type, c.identification, b.legal_name, LOWER(HEX(b.tax_regime_id)) AS '
            . 'tax_regime_id, r.name AS tax_regime_name FROM clients c '
            . 'LEFT JOIN client_billing_profiles b ON b.client_id = c.id '
            . 'LEFT JOIN tax_regimes r ON r.id = b.tax_regime_id WHERE c.id = UNHEX(:id) AND c.deleted_at IS NULL',
            ['id' => Uuid::toHex($clientId)],
        );
        if ($row === false) {
            return null;
        }

        $regimeId = Row::nullableString($row, 'tax_regime_id');

        return [
            'id' => $clientId,
            'name' => Row::string($row, 'name'),
            'legal_name' => Row::nullableString($row, 'legal_name'),
            'identification_type' => Row::string($row, 'identification_type'),
            'identification' => Row::nullableString($row, 'identification'),
            'tax_regime' => $regimeId === null
                ? null
                : ['id' => Uuid::fromHex($regimeId), 'name' => Row::string($row, 'tax_regime_name')],
            'addresses' => $this->addressesOf($clientId),
        ];
    }

    /** @return array<string, string|null> the bound columns shared by insert and update */
    private function columns(ClientData $data): array
    {
        return [
            'name' => $data->name,
            'identification_type' => $data->identificationType,
            'identification' => $data->identification,
            'status_id' => $data->statusId === null ? null : Uuid::toHex($data->statusId),
            'segment_id' => $data->segmentId === null ? null : Uuid::toHex($data->segmentId),
            'area_id' => $data->areaId === null ? null : Uuid::toHex($data->areaId),
            'margin_level_id' => $data->marginLevelId === null ? null : Uuid::toHex($data->marginLevelId),
        ];
    }

    /** Replaces the whole set of addresses, in the order they were sent. */
    private function replaceAddresses(string $clientId, ClientData $data): void
    {
        $hex = Uuid::toHex($clientId);
        $this->connection->executeStatement(
            'DELETE FROM client_addresses WHERE client_id = UNHEX(:id)',
            ['id' => $hex],
        );
        foreach ($data->addresses as $position => $address) {
            $this->connection->executeStatement(
                'INSERT INTO client_addresses (id, client_id, sort_order, label, address, zone, country, is_primary) '
                . 'VALUES (UNHEX(:id), UNHEX(:client), :position, :label, :address, :zone, :country, :is_primary)',
                [
                    'id' => Uuid::toHex(Uuid::v7()),
                    'client' => $hex,
                    'position' => $position,
                    'label' => $address->label,
                    'address' => $address->address,
                    'zone' => $address->zone,
                    'country' => $address->country,
                    'is_primary' => $address->isPrimary ? 1 : 0,
                ],
            );
        }
    }

    /** Replaces the billing profile; null leaves a prospect without one. */
    private function replaceBilling(string $clientId, ?BillingProfile $billing): void
    {
        $this->connection->executeStatement(
            'DELETE FROM client_billing_profiles WHERE client_id = UNHEX(:id)',
            ['id' => Uuid::toHex($clientId)],
        );
        if ($billing === null) {
            return;
        }

        $this->connection->executeStatement(
            'INSERT INTO client_billing_profiles (client_id, legal_name, tax_regime_id, payment_method_id, '
            . 'credit_days, credit_limit) VALUES (UNHEX(:client), :legal_name, UNHEX(:tax_regime_id), '
            . 'UNHEX(:payment_method_id), :credit_days, :credit_limit)',
            [
                'client' => Uuid::toHex($clientId),
                'legal_name' => $billing->legalName,
                'tax_regime_id' => Uuid::toHex($billing->taxRegimeId),
                'payment_method_id' => $billing->paymentMethodId === null
                    ? null
                    : Uuid::toHex($billing->paymentMethodId),
                'credit_days' => $billing->creditDays,
                'credit_limit' => $billing->creditLimit,
            ],
        );
    }

    /** @return list<Address> */
    private function addressesOf(string $clientId): array
    {
        $rows = $this->connection->fetchAllAssociative(
            'SELECT label, address, zone, country, is_primary FROM client_addresses '
            . 'WHERE client_id = UNHEX(:id) ORDER BY sort_order',
            ['id' => Uuid::toHex($clientId)],
        );

        return array_map(static fn (array $row): Address => new Address(
            Row::string($row, 'label'),
            Row::string($row, 'address'),
            Row::nullableString($row, 'zone'),
            Row::nullableString($row, 'country'),
            Row::bool($row, 'is_primary'),
        ), $rows);
    }

    /** @return array{profile: BillingProfile|null, refs: array<string, array{id: string, name: string}|null>} */
    private function billingOf(string $clientId): array
    {
        $row = $this->connection->fetchAssociative(
            'SELECT b.legal_name, LOWER(HEX(b.tax_regime_id)) AS tax_regime_id, r.name AS tax_regime_name, '
            . 'LOWER(HEX(b.payment_method_id)) AS payment_method_id, p.name AS payment_method_name, '
            . 'b.credit_days, b.credit_limit FROM client_billing_profiles b '
            . 'JOIN tax_regimes r ON r.id = b.tax_regime_id '
            . 'LEFT JOIN payment_methods p ON p.id = b.payment_method_id WHERE b.client_id = UNHEX(:id)',
            ['id' => Uuid::toHex($clientId)],
        );
        if ($row === false) {
            return ['profile' => null, 'refs' => []];
        }

        $taxRegimeId = Uuid::fromHex(Row::string($row, 'tax_regime_id'));
        $methodId = Row::nullableString($row, 'payment_method_id');
        $creditDays = Row::nullableString($row, 'credit_days');

        return [
            'profile' => new BillingProfile(
                Row::string($row, 'legal_name'),
                $taxRegimeId,
                $methodId === null ? null : Uuid::fromHex($methodId),
                $creditDays === null ? null : (int) $creditDays,
                Row::nullableString($row, 'credit_limit'),
            ),
            'refs' => [
                'tax_regime' => ['id' => $taxRegimeId, 'name' => Row::string($row, 'tax_regime_name')],
                'payment_method' => $methodId === null
                    ? null
                    : ['id' => Uuid::fromHex($methodId), 'name' => Row::string($row, 'payment_method_name')],
            ],
        ];
    }

    /** @return list<array{user: array{id: string, name: string}, is_responsible: bool}> responsible first */
    private function sellersOf(string $clientId): array
    {
        $rows = $this->connection->fetchAllAssociative(
            'SELECT LOWER(HEX(s.user_id)) AS user_id, u.name, s.is_responsible FROM client_sellers s '
            . 'JOIN users u ON u.id = s.user_id WHERE s.client_id = UNHEX(:id) '
            . 'ORDER BY s.is_responsible DESC, u.name, s.user_id',
            ['id' => Uuid::toHex($clientId)],
        );

        return array_map(static fn (array $row): array => [
            'user' => ['id' => Uuid::fromHex(Row::string($row, 'user_id')), 'name' => Row::string($row, 'name')],
            'is_responsible' => Row::bool($row, 'is_responsible'),
        ], $rows);
    }

    /**
     * The people linked to the client that the reader may see by the data scope of contacts.
     *
     * @return list<array{
     *     contact: array{id: string, code: string, name: string},
     *     contact_type: array{id: string, name: string}
     * }>
     */
    private function contactsOf(string $clientId, CurrentUser $reader): array
    {
        $query = $this->connection->createQueryBuilder()
            ->select(
                'LOWER(HEX(ct.id)) AS contact_id, ct.code, ct.name, LOWER(HEX(t.id)) AS type_id, t.name AS type_name',
            )
            ->from('client_contacts', 'cc')
            ->innerJoin('cc', 'contacts', 'ct', 'ct.id = cc.contact_id')
            ->innerJoin('cc', 'contact_types', 't', 't.id = cc.contact_type_id')
            ->where('cc.client_id = UNHEX(:client)')
            ->setParameter('client', Uuid::toHex($clientId))
            ->orderBy('ct.name')
            ->addOrderBy('ct.id')
            ->addOrderBy('t.name');
        ScopedQuery::restrict($query, $reader, 'contacts', 'ct.owner_id');

        return array_map(static fn (array $row): array => [
            'contact' => [
                'id' => Uuid::fromHex(Row::string($row, 'contact_id')),
                'code' => Row::string($row, 'code'),
                'name' => Row::string($row, 'name'),
            ],
            'contact_type' => [
                'id' => Uuid::fromHex(Row::string($row, 'type_id')),
                'name' => Row::string($row, 'type_name'),
            ],
        ], $query->executeQuery()->fetchAllAssociative());
    }

    /** `FROM clients c` with its catalog values and responsible adviser joined and the reader's scope applied. */
    private function base(CurrentUser $reader, string $select): QueryBuilder
    {
        $query = $this->connection->createQueryBuilder()
            ->select($select)
            ->from('clients', 'c')
            ->leftJoin('c', 'client_statuses', 'st', 'st.id = c.status_id')
            ->leftJoin('c', 'segments', 'sg', 'sg.id = c.segment_id')
            ->leftJoin('c', 'areas', 'ar', 'ar.id = c.area_id')
            ->leftJoin('c', 'margin_levels', 'ml', 'ml.id = c.margin_level_id')
            ->leftJoin('c', 'client_sellers', 'rs', 'rs.client_id = c.id AND rs.is_responsible = 1')
            ->leftJoin('rs', 'users', 'ru', 'ru.id = rs.user_id');
        ScopedQuery::restrictByLink($query, $reader, self::RESOURCE, 'c.id', 'client_sellers', 'client_id', 'user_id');

        return $query;
    }

    /**
     * @param array<string, mixed> $row
     * @param list<Address> $addresses
     * @param array<string, array{id: string, name: string}|null> $billingRefs
     * @param list<array{user: array{id: string, name: string}, is_responsible: bool}>|null $sellers null for a list
     */
    private function hydrate(
        array $row,
        array $addresses,
        ?BillingProfile $billing,
        array $billingRefs,
        ?array $sellers,
    ): ClientRecord {
        $responsibleId = Row::nullableString($row, 'responsible_id');
        $status = Row::nullableString($row, 'status_id');
        $refs = [
            'status' => $status === null ? null : [
                'id' => Uuid::fromHex($status),
                'name' => Row::string($row, 'status_name'),
                'color' => Row::string($row, 'status_color'),
            ],
            'segment' => $this->ref($row, 'segment'),
            'area' => $this->ref($row, 'area'),
            'margin_level' => $this->ref($row, 'margin_level'),
        ] + $billingRefs;
        $identification = Row::nullableString($row, 'identification');

        return new ClientRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            Row::string($row, 'code'),
            Row::string($row, 'type'),
            new ClientData(
                Row::string($row, 'name'),
                Row::string($row, 'identification_type'),
                $identification,
                $refs['status']['id'] ?? null,
                $refs['segment']['id'] ?? null,
                $refs['area']['id'] ?? null,
                $refs['margin_level']['id'] ?? null,
                $addresses,
                $billing,
            ),
            $refs,
            Row::nullableDate($row, 'converted_at'),
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
            Row::nullableDate($row, 'deleted_at'),
            $responsibleId === null
                ? null
                : ['id' => Uuid::fromHex($responsibleId), 'name' => Row::string($row, 'responsible_name')],
            Row::int($row, 'seller_count'),
            $sellers,
        );
    }

    /**
     * @param array<string, mixed> $row
     * @return array{id: string, name: string}|null
     */
    private function ref(array $row, string $name): ?array
    {
        $id = Row::nullableString($row, $name . '_id');

        return $id === null ? null : ['id' => Uuid::fromHex($id), 'name' => Row::string($row, $name . '_name')];
    }
}
