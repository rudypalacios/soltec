<?php

declare(strict_types=1);

namespace Soltec\Modules\Suppliers\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Query\QueryBuilder;
use Soltec\Kernel\Address;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Suppliers\Domain\SupplierContact;
use Soltec\Modules\Suppliers\Domain\SupplierData;
use Soltec\Modules\Suppliers\Domain\SupplierRecord;

/**
 * Reads and writes `suppliers` with their addresses and people. A supplier has no owner and no data scope: whoever
 * may see the section sees all of them (ADR-0025). Ids cross the database as hex (see Uuid).
 */
final class SupplierRepository
{
    private const COLUMNS = 'LOWER(HEX(s.id)) AS id, s.code, s.name, s.legal_name, s.identification_type, '
        . 's.identification, s.credit_days, s.credit_limit, s.created_at, s.updated_at, s.version, s.deleted_at';

    public function __construct(private readonly Connection $connection)
    {
    }

    /** One supplier with its addresses and people, or null. */
    public function find(string $id): ?SupplierRecord
    {
        $row = $this->base(self::COLUMNS)
            ->andWhere('s.id = UNHEX(:id)')
            ->setParameter('id', Uuid::toHex($id))
            ->executeQuery()
            ->fetchAssociative();
        if ($row === false) {
            return null;
        }

        return $this->hydrate($row, $this->addressesOf($id), $this->contactsOf($id));
    }

    /** Locks the row until the end of the transaction. */
    public function lock(string $id): bool
    {
        return $this->connection->fetchOne(
            'SELECT 1 FROM suppliers WHERE id = UNHEX(:id) FOR UPDATE',
            ['id' => Uuid::toHex($id)],
        ) !== false;
    }

    /**
     * @param string $status active, inactive or all
     * @return array{records: list<SupplierRecord>, total: int}
     */
    public function search(?string $text, string $status, Pagination $page): array
    {
        $filtered = function (QueryBuilder $query) use ($text, $status): QueryBuilder {
            if ($status === 'active') {
                $query->andWhere('s.deleted_at IS NULL');
            } elseif ($status === 'inactive') {
                $query->andWhere('s.deleted_at IS NOT NULL');
            }
            if ($text !== null && $text !== '') {
                $query->andWhere(
                    '(s.name LIKE :text OR s.legal_name LIKE :text OR s.identification LIKE :text '
                    . 'OR s.code LIKE :text)',
                )->setParameter('text', '%' . addcslashes($text, '%_\\') . '%');
            }

            return $query;
        };

        $total = $filtered($this->base('COUNT(*)'))->executeQuery()->fetchOne();
        $rows = $filtered($this->base(self::COLUMNS))
            ->orderBy('s.name')
            ->addOrderBy('s.id')
            ->setFirstResult($page->offset())
            ->setMaxResults($page->perPage)
            ->executeQuery()
            ->fetchAllAssociative();

        return [
            'records' => array_map(fn (array $row): SupplierRecord => $this->hydrate($row, null, null), $rows),
            'total' => is_numeric($total) ? (int) $total : 0,
        ];
    }

    /**
     * The active suppliers, by name, for a selector in another form.
     *
     * @return list<array{id: string, code: string, name: string}>
     */
    public function options(?string $text, int $limit): array
    {
        $query = $this->connection->createQueryBuilder()
            ->select('LOWER(HEX(s.id)) AS id, s.code, s.name')
            ->from('suppliers', 's')
            ->where('s.deleted_at IS NULL')
            ->orderBy('s.name')
            ->addOrderBy('s.id')
            ->setMaxResults($limit);
        if ($text !== null && $text !== '') {
            $query->andWhere('(s.name LIKE :text OR s.code LIKE :text)')
                ->setParameter('text', '%' . addcslashes($text, '%_\\') . '%');
        }

        $options = [];
        foreach ($query->executeQuery()->fetchAllAssociative() as $row) {
            $options[] = [
                'id' => Uuid::fromHex(Row::string($row, 'id')),
                'code' => Row::string($row, 'code'),
                'name' => Row::string($row, 'name'),
            ];
        }

        return $options;
    }

    /** @throws \Doctrine\DBAL\Exception\UniqueConstraintViolationException when the identification is taken */
    public function insert(string $id, string $code, SupplierData $data, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'INSERT INTO suppliers (id, code, name, legal_name, identification_type, identification, credit_days, '
            . 'credit_limit, created_at, updated_at) VALUES (UNHEX(:id), :code, :name, :legal_name, '
            . ':identification_type, :identification, :credit_days, :credit_limit, :now, :now)',
            ['id' => Uuid::toHex($id), 'code' => $code, 'now' => Timestamps::toDb($now)] + $this->columns($data),
        );
        $this->replaceChildren($id, $data);
    }

    /**
     * @return bool false when the version is stale or the supplier does not exist
     * @throws \Doctrine\DBAL\Exception\UniqueConstraintViolationException when the identification is taken
     */
    public function update(string $id, int $version, SupplierData $data, DateTimeImmutable $now): bool
    {
        $changed = $this->connection->executeStatement(
            'UPDATE suppliers SET name = :name, legal_name = :legal_name, identification_type = '
            . ':identification_type, identification = :identification, credit_days = :credit_days, '
            . 'credit_limit = :credit_limit, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id) AND version = :version',
            ['id' => Uuid::toHex($id), 'version' => $version, 'now' => Timestamps::toDb($now)]
            + $this->columns($data),
        ) === 1;
        if ($changed) {
            $this->replaceChildren($id, $data);
        }

        return $changed;
    }

    /**
     * Deactivates (a date) or reactivates (null).
     *
     * @throws \Doctrine\DBAL\Exception\UniqueConstraintViolationException when reactivating and another active
     *         supplier took the identification meanwhile
     */
    public function setDeletedAt(string $id, ?DateTimeImmutable $deletedAt, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE suppliers SET deleted_at = :deleted_at, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id)',
            [
                'id' => Uuid::toHex($id),
                'deleted_at' => $deletedAt === null ? null : Timestamps::toDb($deletedAt),
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /**
     * The other supplier that holds an identification, an active one first. A deactivated supplier keeps its
     * identification reserved, so it is found here too (the unique index alone only covers the active ones).
     *
     * @param string|null $exceptId the supplier being edited, who never conflicts with itself
     * @return array{id: string, name: string, active: bool}|null
     */
    public function holderOf(string $identification, ?string $exceptId): ?array
    {
        $row = $this->connection->fetchAssociative(
            'SELECT LOWER(HEX(id)) AS id, name, deleted_at FROM suppliers WHERE identification = :identification '
            . "AND identification_type <> 'none' AND (:except IS NULL OR id <> UNHEX(:except)) "
            . 'ORDER BY deleted_at IS NULL DESC, created_at LIMIT 1',
            ['identification' => $identification, 'except' => $exceptId === null ? null : Uuid::toHex($exceptId)],
        );
        if ($row === false) {
            return null;
        }

        return [
            'id' => Uuid::fromHex(Row::string($row, 'id')),
            'name' => Row::string($row, 'name'),
            'active' => Row::nullableString($row, 'deleted_at') === null,
        ];
    }

    /**
     * Which of the contact types are active, so a person is not filed under a type that was switched off.
     *
     * @param list<string> $ids
     * @return list<string> the ids that are active
     */
    public function activeContactTypeIds(array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $query = $this->connection->createQueryBuilder()
            ->select('LOWER(HEX(t.id)) AS id')
            ->from('contact_types', 't')
            ->where('t.deleted_at IS NULL');
        $placeholders = [];
        foreach ($ids as $index => $id) {
            $placeholders[] = sprintf('UNHEX(:type_%d)', $index);
            $query->setParameter('type_' . $index, Uuid::toHex($id));
        }
        $query->andWhere(sprintf('t.id IN (%s)', implode(', ', $placeholders)));

        $active = [];
        foreach ($query->executeQuery()->fetchAllAssociative() as $row) {
            $active[] = Uuid::fromHex(Row::string($row, 'id'));
        }

        return $active;
    }

    /** @return array<string, string|int|null> the bound columns shared by insert and update */
    private function columns(SupplierData $data): array
    {
        return [
            'name' => $data->name,
            'legal_name' => $data->legalName,
            'identification_type' => $data->identificationType,
            'identification' => $data->identification,
            'credit_days' => $data->creditDays,
            'credit_limit' => $data->creditLimit,
        ];
    }

    /** Replaces the whole set of addresses and people, in the order they were sent. */
    private function replaceChildren(string $supplierId, SupplierData $data): void
    {
        $hex = Uuid::toHex($supplierId);
        foreach (['supplier_addresses', 'supplier_contacts'] as $table) {
            $this->connection->executeStatement(
                sprintf('DELETE FROM %s WHERE supplier_id = UNHEX(:id)', $table),
                ['id' => $hex],
            );
        }

        foreach ($data->addresses as $position => $address) {
            $this->connection->executeStatement(
                'INSERT INTO supplier_addresses (id, supplier_id, sort_order, label, address, zone, country, '
                . 'is_primary) VALUES (UNHEX(:id), UNHEX(:supplier), :position, :label, :address, :zone, '
                . ':country, :is_primary)',
                [
                    'id' => Uuid::toHex(Uuid::v7()),
                    'supplier' => $hex,
                    'position' => $position,
                    'label' => $address->label,
                    'address' => $address->address,
                    'zone' => $address->zone,
                    'country' => $address->country,
                    'is_primary' => $address->isPrimary ? 1 : 0,
                ],
            );
        }

        foreach ($data->contacts as $position => $contact) {
            $this->connection->executeStatement(
                'INSERT INTO supplier_contacts (id, supplier_id, sort_order, name, job_title, contact_type_id, '
                . 'phone, mobile, email, address, zone, country) VALUES (UNHEX(:id), UNHEX(:supplier), '
                . ':position, :name, :job_title, UNHEX(:contact_type_id), :phone, :mobile, :email, :address, '
                . ':zone, :country)',
                [
                    'id' => Uuid::toHex(Uuid::v7()),
                    'supplier' => $hex,
                    'position' => $position,
                    'contact_type_id' => $contact->contactTypeId === null ? null : Uuid::toHex($contact->contactTypeId),
                ] + array_diff_key($contact->toArray(), ['contact_type_id' => true]),
            );
        }
    }

    /** @return list<Address> */
    private function addressesOf(string $supplierId): array
    {
        $rows = $this->connection->fetchAllAssociative(
            'SELECT label, address, zone, country, is_primary FROM supplier_addresses '
            . 'WHERE supplier_id = UNHEX(:id) ORDER BY sort_order',
            ['id' => Uuid::toHex($supplierId)],
        );

        return array_map(static fn (array $row): Address => new Address(
            Row::string($row, 'label'),
            Row::string($row, 'address'),
            Row::nullableString($row, 'zone'),
            Row::nullableString($row, 'country'),
            Row::bool($row, 'is_primary'),
        ), $rows);
    }

    /** @return list<SupplierContact> */
    private function contactsOf(string $supplierId): array
    {
        $rows = $this->connection->fetchAllAssociative(
            'SELECT c.name, c.job_title, LOWER(HEX(c.contact_type_id)) AS contact_type_id, t.name AS type_name, '
            . 'c.phone, c.mobile, c.email, c.address, c.zone, c.country FROM supplier_contacts c '
            . 'LEFT JOIN contact_types t ON t.id = c.contact_type_id '
            . 'WHERE c.supplier_id = UNHEX(:id) ORDER BY c.sort_order',
            ['id' => Uuid::toHex($supplierId)],
        );

        return array_map(static function (array $row): SupplierContact {
            $typeId = Row::nullableString($row, 'contact_type_id');

            return new SupplierContact(
                Row::string($row, 'name'),
                Row::nullableString($row, 'job_title'),
                $typeId === null ? null : Uuid::fromHex($typeId),
                Row::nullableString($row, 'phone'),
                Row::nullableString($row, 'mobile'),
                Row::nullableString($row, 'email'),
                Row::nullableString($row, 'address'),
                Row::nullableString($row, 'zone'),
                Row::nullableString($row, 'country'),
                Row::nullableString($row, 'type_name'),
            );
        }, $rows);
    }

    private function base(string $select): QueryBuilder
    {
        return $this->connection->createQueryBuilder()->select($select)->from('suppliers', 's');
    }

    /**
     * @param array<string, mixed> $row
     * @param list<Address>|null $addresses null for a list, where they are not read
     * @param list<SupplierContact>|null $contacts null for a list, where they are not read
     */
    private function hydrate(array $row, ?array $addresses, ?array $contacts): SupplierRecord
    {
        $creditDays = Row::nullableString($row, 'credit_days');

        return new SupplierRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            Row::string($row, 'code'),
            new SupplierData(
                Row::string($row, 'name'),
                Row::nullableString($row, 'legal_name'),
                Row::string($row, 'identification_type'),
                Row::nullableString($row, 'identification'),
                $creditDays === null ? null : (int) $creditDays,
                Row::nullableString($row, 'credit_limit'),
                $addresses ?? [],
                $contacts ?? [],
            ),
            $addresses !== null,
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
            Row::nullableDate($row, 'deleted_at'),
        );
    }
}
