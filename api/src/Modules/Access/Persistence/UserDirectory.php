<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Persistence;

use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\ParameterType;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Uuid;

/**
 * The people other modules pick from a list: active internal users, by name. A task is assigned to one of them and a
 * comment mentions them. It lists everybody active; each module narrows it with its own rules.
 */
final class UserDirectory
{
    public function __construct(private readonly Connection $connection)
    {
    }

    /**
     * Active internal users whose name or email contains the text, by name.
     *
     * @return list<array{id: string, name: string}>
     */
    public function search(?string $text, int $limit): array
    {
        $sql = "SELECT LOWER(HEX(u.id)) AS id, u.name FROM users u WHERE u.type = 'internal' AND u.deleted_at IS NULL";
        $params = ['limit' => $limit];
        if ($text !== null && $text !== '') {
            $sql .= ' AND (u.name LIKE :text OR u.email LIKE :text)';
            $params['text'] = '%' . addcslashes($text, '%_\\') . '%';
        }

        return $this->options($this->connection->fetchAllAssociative(
            $sql . ' ORDER BY u.name, u.id LIMIT :limit',
            $params,
            ['limit' => ParameterType::INTEGER],
        ));
    }

    /**
     * Of these users, the active internal ones, with their names.
     *
     * @param list<string> $userIds
     * @return list<array{id: string, name: string}>
     */
    public function activeAmong(array $userIds): array
    {
        if ($userIds === []) {
            return [];
        }

        return $this->options($this->connection->fetchAllAssociative(
            "SELECT LOWER(HEX(id)) AS id, name FROM users WHERE type = 'internal' AND deleted_at IS NULL "
            . 'AND LOWER(HEX(id)) IN (:ids) ORDER BY name, id',
            ['ids' => array_map(Uuid::toHex(...), $userIds)],
            ['ids' => ArrayParameterType::STRING],
        ));
    }

    /** Whether the user is active and internal. Takes a shared lock so they stay one until the transaction ends. */
    public function isActiveInternal(string $userId): bool
    {
        return $this->connection->fetchOne(
            "SELECT 1 FROM users WHERE id = UNHEX(:id) AND type = 'internal' AND deleted_at IS NULL "
            . 'LOCK IN SHARE MODE',
            ['id' => Uuid::toHex($userId)],
        ) !== false;
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<array{id: string, name: string}>
     */
    private function options(array $rows): array
    {
        return array_map(
            static fn (array $row): array => [
                'id' => Uuid::fromHex(Row::string($row, 'id')),
                'name' => Row::string($row, 'name'),
            ],
            $rows,
        );
    }
}
