<?php

declare(strict_types=1);

namespace Soltec\Modules\Clients\Persistence;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Uuid;

/** Reads and writes `client_contacts`: which people of an adviser are linked to a client, and in what role. */
final class ClientContactRepository
{
    public function __construct(private readonly Connection $connection)
    {
    }

    /** @return list<string> ids of the contact types the person has with the client */
    public function rolesOf(string $clientId, string $contactId): array
    {
        $rows = $this->connection->fetchAllAssociative(
            'SELECT LOWER(HEX(contact_type_id)) AS id FROM client_contacts '
            . 'WHERE client_id = UNHEX(:client) AND contact_id = UNHEX(:contact) ORDER BY contact_type_id',
            ['client' => Uuid::toHex($clientId), 'contact' => Uuid::toHex($contactId)],
        );

        return array_map(static fn (array $row): string => Uuid::fromHex(Row::string($row, 'id')), $rows);
    }

    /**
     * Replaces the roles of the person with the client by exactly these.
     *
     * @param list<string> $typeIds
     */
    public function replaceRoles(string $clientId, string $contactId, array $typeIds): void
    {
        $this->unlink($clientId, $contactId);
        foreach ($typeIds as $typeId) {
            $this->connection->executeStatement(
                'INSERT INTO client_contacts (client_id, contact_id, contact_type_id) '
                . 'VALUES (UNHEX(:client), UNHEX(:contact), UNHEX(:type))',
                [
                    'client' => Uuid::toHex($clientId),
                    'contact' => Uuid::toHex($contactId),
                    'type' => Uuid::toHex($typeId),
                ],
            );
        }
    }

    public function unlink(string $clientId, string $contactId): void
    {
        $this->connection->executeStatement(
            'DELETE FROM client_contacts WHERE client_id = UNHEX(:client) AND contact_id = UNHEX(:contact)',
            ['client' => Uuid::toHex($clientId), 'contact' => Uuid::toHex($contactId)],
        );
    }

    /**
     * The people of an adviser that go with the clients handed over: those linked to these clients and to no other.
     * A person who is also linked to a client that stays keeps their owner.
     *
     * @param non-empty-list<string> $clientIds the clients being handed over
     * @return array{movable: list<string>, kept: int}
     */
    public function handover(array $clientIds, string $ownerId): array
    {
        $placeholders = [];
        $params = ['owner' => Uuid::toHex($ownerId)];
        foreach ($clientIds as $index => $clientId) {
            $placeholders[] = sprintf('UNHEX(:client_%d)', $index);
            $params['client_' . $index] = Uuid::toHex($clientId);
        }
        $set = implode(', ', $placeholders);

        $rows = $this->connection->fetchAllAssociative(
            'SELECT LOWER(HEX(ct.id)) AS id, '
            . '(SELECT COUNT(DISTINCT o.client_id) FROM client_contacts o WHERE o.contact_id = ct.id) AS total, '
            . sprintf(
                '(SELECT COUNT(DISTINCT o.client_id) FROM client_contacts o WHERE o.contact_id = ct.id '
                . 'AND o.client_id IN (%s)) AS inside ',
                $set,
            )
            . sprintf(
                'FROM contacts ct WHERE ct.owner_id = UNHEX(:owner) AND ct.id IN '
                . '(SELECT contact_id FROM client_contacts WHERE client_id IN (%s)) ORDER BY ct.id',
                $set,
            ),
            $params,
        );

        $movable = [];
        $kept = 0;
        foreach ($rows as $row) {
            if (Row::int($row, 'total') === Row::int($row, 'inside')) {
                $movable[] = Uuid::fromHex(Row::string($row, 'id'));
            } else {
                ++$kept;
            }
        }

        return ['movable' => $movable, 'kept' => $kept];
    }
}
