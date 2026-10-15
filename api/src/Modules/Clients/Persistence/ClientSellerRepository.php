<?php

declare(strict_types=1);

namespace Soltec\Modules\Clients\Persistence;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Auth\ScopedQuery;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Uuid;

/**
 * Reads and writes `client_sellers`, the advisers of a client (ADR-0025). The callers hold the lock of the client
 * (`ClientRepository::lock`) while they change them, so the rules about the responsible one are checked on a row
 * that nobody else is changing; the unique index on `responsible_marker` is only the last resort.
 */
final class ClientSellerRepository
{
    public function __construct(private readonly Connection $connection)
    {
    }

    public function isSeller(string $clientId, string $userId): bool
    {
        return $this->connection->fetchOne(
            'SELECT 1 FROM client_sellers WHERE client_id = UNHEX(:client) AND user_id = UNHEX(:user)',
            ['client' => Uuid::toHex($clientId), 'user' => Uuid::toHex($userId)],
        ) !== false;
    }

    public function isResponsible(string $clientId, string $userId): bool
    {
        return $this->connection->fetchOne(
            'SELECT 1 FROM client_sellers WHERE client_id = UNHEX(:client) AND user_id = UNHEX(:user) '
            . 'AND is_responsible = 1',
            ['client' => Uuid::toHex($clientId), 'user' => Uuid::toHex($userId)],
        ) !== false;
    }

    public function add(string $clientId, string $userId, bool $responsible): void
    {
        $this->connection->executeStatement(
            'INSERT INTO client_sellers (client_id, user_id, is_responsible) '
            . 'VALUES (UNHEX(:client), UNHEX(:user), :responsible)',
            [
                'client' => Uuid::toHex($clientId),
                'user' => Uuid::toHex($userId),
                'responsible' => $responsible ? 1 : 0,
            ],
        );
    }

    public function remove(string $clientId, string $userId): void
    {
        $this->connection->executeStatement(
            'DELETE FROM client_sellers WHERE client_id = UNHEX(:client) AND user_id = UNHEX(:user)',
            ['client' => Uuid::toHex($clientId), 'user' => Uuid::toHex($userId)],
        );
    }

    /** Makes the adviser the responsible one; the previous one stays an adviser. */
    public function setResponsible(string $clientId, string $userId): void
    {
        $this->connection->executeStatement(
            'UPDATE client_sellers SET is_responsible = 0 WHERE client_id = UNHEX(:client) AND is_responsible = 1',
            ['client' => Uuid::toHex($clientId)],
        );
        $this->connection->executeStatement(
            'UPDATE client_sellers SET is_responsible = 1 WHERE client_id = UNHEX(:client) AND user_id = UNHEX(:user)',
            ['client' => Uuid::toHex($clientId), 'user' => Uuid::toHex($userId)],
        );
    }

    /** Hands the place of an adviser to another user, who becomes responsible if the first one was. */
    public function replace(string $clientId, string $from, string $to): void
    {
        $this->connection->executeStatement(
            'UPDATE client_sellers SET user_id = UNHEX(:to) '
            . 'WHERE client_id = UNHEX(:client) AND user_id = UNHEX(:from)',
            ['client' => Uuid::toHex($clientId), 'from' => Uuid::toHex($from), 'to' => Uuid::toHex($to)],
        );
    }

    /**
     * The clients the reader reaches where the user is an adviser, active or not, for a whole-portfolio handover.
     *
     * @return list<string>
     */
    public function clientIdsOf(CurrentUser $reader, string $userId): array
    {
        $query = $this->connection->createQueryBuilder()
            ->select('LOWER(HEX(c.id)) AS id')
            ->from('clients', 'c')
            ->where('EXISTS (SELECT 1 FROM client_sellers f WHERE f.client_id = c.id AND f.user_id = UNHEX(:user))')
            ->setParameter('user', Uuid::toHex($userId))
            ->orderBy('c.id');
        ScopedQuery::restrictByLink(
            $query,
            $reader,
            ClientRepository::RESOURCE,
            'c.id',
            'client_sellers',
            'client_id',
            'user_id',
        );

        return array_map(
            static fn (array $row): string => Uuid::fromHex(Row::string($row, 'id')),
            $query->executeQuery()->fetchAllAssociative(),
        );
    }
}
