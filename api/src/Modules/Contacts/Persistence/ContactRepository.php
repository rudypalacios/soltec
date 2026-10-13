<?php

declare(strict_types=1);

namespace Soltec\Modules\Contacts\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Query\QueryBuilder;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Auth\ScopedQuery;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Contacts\Domain\ContactData;
use Soltec\Modules\Contacts\Domain\ContactRecord;

/**
 * Reads and writes `contacts`. Every read takes the reader and applies the data scope of the resource (the owner of
 * the contact decides who sees it, ADR-0025), so a contact outside the scope does not exist for them. Ids cross the
 * database as hex (see Uuid).
 */
final class ContactRepository
{
    public const RESOURCE = 'contacts';

    private const COLUMNS = 'LOWER(HEX(c.id)) AS id, c.code, c.name, c.phone, c.mobile, c.email, c.address, c.zone, '
        . 'c.country, LOWER(HEX(c.owner_id)) AS owner_id, o.name AS owner_name, c.created_at, c.updated_at, '
        . 'c.version, c.deleted_at';

    public function __construct(private readonly Connection $connection)
    {
    }

    public function find(string $id, CurrentUser $reader): ?ContactRecord
    {
        $query = $this->base($reader, self::COLUMNS)
            ->andWhere('c.id = UNHEX(:id)')
            ->setParameter('id', Uuid::toHex($id));
        $row = $query->executeQuery()->fetchAssociative();

        return $row === false ? null : $this->hydrate($row);
    }

    /** Locks the row until the end of the transaction. */
    public function lock(string $id): bool
    {
        return $this->connection->fetchOne(
            'SELECT 1 FROM contacts WHERE id = UNHEX(:id) FOR UPDATE',
            ['id' => Uuid::toHex($id)],
        ) !== false;
    }

    /**
     * @param string $status active, inactive or all
     * @return array{records: list<ContactRecord>, total: int}
     */
    public function search(
        CurrentUser $reader,
        ?string $text,
        string $status,
        ?string $ownerId,
        Pagination $page,
    ): array {
        $filtered = function (QueryBuilder $query) use ($text, $status, $ownerId): QueryBuilder {
            if ($status === 'active') {
                $query->andWhere('c.deleted_at IS NULL');
            } elseif ($status === 'inactive') {
                $query->andWhere('c.deleted_at IS NOT NULL');
            }
            if ($ownerId !== null) {
                $query->andWhere('c.owner_id = UNHEX(:owner)')->setParameter('owner', Uuid::toHex($ownerId));
            }
            if ($text !== null && $text !== '') {
                $query->andWhere(
                    '(c.name LIKE :text OR c.email LIKE :text OR c.phone LIKE :text OR c.mobile LIKE :text '
                    . 'OR c.code LIKE :text)',
                )->setParameter('text', '%' . addcslashes($text, '%_\\') . '%');
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
            'records' => array_map($this->hydrate(...), $rows),
            'total' => is_numeric($total) ? (int) $total : 0,
        ];
    }

    public function insert(
        string $id,
        string $code,
        ContactData $data,
        string $ownerId,
        DateTimeImmutable $now,
    ): void {
        $this->connection->executeStatement(
            'INSERT INTO contacts (id, code, name, phone, mobile, email, address, zone, country, owner_id, '
            . 'created_at, updated_at) VALUES (UNHEX(:id), :code, :name, :phone, :mobile, :email, :address, :zone, '
            . ':country, UNHEX(:owner), :now, :now)',
            [
                'id' => Uuid::toHex($id),
                'code' => $code,
                'owner' => Uuid::toHex($ownerId),
                'now' => Timestamps::toDb($now),
            ] + $data->toArray(),
        );
    }

    /** @return bool false when the version is stale or the contact does not exist */
    public function update(
        string $id,
        int $version,
        ContactData $data,
        string $ownerId,
        DateTimeImmutable $now,
    ): bool {
        return $this->connection->executeStatement(
            'UPDATE contacts SET name = :name, phone = :phone, mobile = :mobile, email = :email, '
            . 'address = :address, zone = :zone, country = :country, owner_id = UNHEX(:owner), updated_at = :now, '
            . 'version = version + 1 WHERE id = UNHEX(:id) AND version = :version',
            [
                'id' => Uuid::toHex($id),
                'version' => $version,
                'owner' => Uuid::toHex($ownerId),
                'now' => Timestamps::toDb($now),
            ] + $data->toArray(),
        ) === 1;
    }

    /** Deactivates (a date) or reactivates (null). */
    public function setDeletedAt(string $id, ?DateTimeImmutable $deletedAt, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE contacts SET deleted_at = :deleted_at, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id)',
            [
                'id' => Uuid::toHex($id),
                'deleted_at' => $deletedAt === null ? null : Timestamps::toDb($deletedAt),
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /** Whether the user can own contacts: an active internal user. Takes a shared lock so they stay one meanwhile. */
    public function ownerCanOwn(string $userId): bool
    {
        return $this->connection->fetchOne(
            "SELECT 1 FROM users WHERE id = UNHEX(:id) AND type = 'internal' AND deleted_at IS NULL "
            . 'LOCK IN SHARE MODE',
            ['id' => Uuid::toHex($userId)],
        ) !== false;
    }

    /**
     * The active internal users a contact can be handed to, by name.
     *
     * @param list<string>|null $onlyIds restrict to these users (a team); null for any of them
     * @return list<array{id: string, name: string}>
     */
    public function ownerCandidates(?array $onlyIds, ?string $text, int $limit): array
    {
        $query = $this->connection->createQueryBuilder()
            ->select('LOWER(HEX(u.id)) AS id, u.name')
            ->from('users', 'u')
            ->where("u.type = 'internal'")
            ->andWhere('u.deleted_at IS NULL')
            ->orderBy('u.name')
            ->addOrderBy('u.id')
            ->setMaxResults($limit);
        if ($onlyIds !== null) {
            if ($onlyIds === []) {
                return [];
            }
            $placeholders = [];
            foreach ($onlyIds as $index => $id) {
                $placeholders[] = sprintf('UNHEX(:member_%d)', $index);
                $query->setParameter('member_' . $index, Uuid::toHex($id));
            }
            $query->andWhere(sprintf('u.id IN (%s)', implode(', ', $placeholders)));
        }
        if ($text !== null && $text !== '') {
            $query->andWhere('(u.name LIKE :text OR u.email LIKE :text)')
                ->setParameter('text', '%' . addcslashes($text, '%_\\') . '%');
        }

        $options = [];
        foreach ($query->executeQuery()->fetchAllAssociative() as $row) {
            $options[] = ['id' => Uuid::fromHex(Row::string($row, 'id')), 'name' => Row::string($row, 'name')];
        }

        return $options;
    }

    /** `FROM contacts c` with the owner joined and the reader's data scope applied. */
    private function base(CurrentUser $reader, string $select): QueryBuilder
    {
        $query = $this->connection->createQueryBuilder()
            ->select($select)
            ->from('contacts', 'c')
            ->innerJoin('c', 'users', 'o', 'o.id = c.owner_id');
        ScopedQuery::restrict($query, $reader, self::RESOURCE, 'c.owner_id');

        return $query;
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): ContactRecord
    {
        return new ContactRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            Row::string($row, 'code'),
            new ContactData(
                Row::string($row, 'name'),
                Row::nullableString($row, 'phone'),
                Row::nullableString($row, 'mobile'),
                Row::nullableString($row, 'email'),
                Row::nullableString($row, 'address'),
                Row::nullableString($row, 'zone'),
                Row::nullableString($row, 'country'),
            ),
            Uuid::fromHex(Row::string($row, 'owner_id')),
            Row::string($row, 'owner_name'),
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
            Row::nullableDate($row, 'deleted_at'),
        );
    }
}
