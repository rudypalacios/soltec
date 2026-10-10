<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Persistence;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Auth\AccessClaims;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Auth\CurrentUserLoader;
use Soltec\Kernel\Auth\DataScope;
use Soltec\Kernel\Auth\RoleRef;
use Soltec\Kernel\Auth\Team;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Uuid;

/**
 * Builds the CurrentUser from the database on every request: roles, then the union of their permissions and the
 * widest scope per resource, and the team when some scope is `team`. A deactivated user, a revoked device or an
 * inactive role grants nothing.
 */
final class PermissionLoader implements CurrentUserLoader
{
    public function __construct(private readonly Connection $connection)
    {
    }

    public function load(AccessClaims $claims): ?CurrentUser
    {
        $usable = $this->connection->fetchOne(
            'SELECT 1 FROM devices d JOIN users u ON u.id = d.user_id WHERE d.id = UNHEX(:device_id) '
            . 'AND d.user_id = UNHEX(:user_id) AND d.revoked_at IS NULL AND u.deleted_at IS NULL',
            ['device_id' => Uuid::toHex($claims->deviceId), 'user_id' => Uuid::toHex($claims->userId)],
        );

        return $usable === false ? null : $this->build($claims->userId, $claims->deviceId, $claims->restricted);
    }

    /** Builds the user without checking the session, for a login that has just verified the credentials. */
    public function build(string $userId, string $deviceId, bool $restricted): ?CurrentUser
    {
        $hexId = Uuid::toHex($userId);
        $user = $this->connection->fetchAssociative(
            'SELECT type, name, email FROM users WHERE id = UNHEX(:id)',
            ['id' => $hexId],
        );
        if ($user === false) {
            return null;
        }

        $roles = [];
        $roleHexIds = [];
        foreach (
            $this->connection->fetchAllAssociative(
                'SELECT LOWER(HEX(r.id)) AS id, r.code, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id '
                . 'WHERE ur.user_id = UNHEX(:id) AND r.deleted_at IS NULL ORDER BY r.name',
                ['id' => $hexId],
            ) as $row
        ) {
            $roleHexIds[] = Row::string($row, 'id');
            $roles[] = new RoleRef(
                Uuid::fromHex(Row::string($row, 'id')),
                Row::nullableString($row, 'code'),
                Row::string($row, 'name'),
            );
        }

        $scopes = $this->scopes($roleHexIds);

        return new CurrentUser(
            $userId,
            $deviceId,
            Row::string($user, 'type'),
            Row::string($user, 'name'),
            Row::string($user, 'email'),
            $roles,
            $this->permissions($roleHexIds),
            $scopes,
            $restricted,
            in_array(DataScope::Team, $scopes, true) ? $this->team($userId) : [],
        );
    }

    /** @return list<string> */
    private function team(string $userId): array
    {
        $people = array_map(
            static fn (array $row): array => [
                'id' => Uuid::fromHex(Row::string($row, 'id')),
                'manager_id' => self::nullableId($row, 'manager_id'),
                'department_id' => self::nullableId($row, 'department_id'),
            ],
            $this->connection->fetchAllAssociative(
                'SELECT LOWER(HEX(id)) AS id, LOWER(HEX(manager_id)) AS manager_id, '
                . "LOWER(HEX(department_id)) AS department_id FROM users WHERE type = 'internal'",
            ),
        );

        return Team::members($userId, $people);
    }

    /** @param array<string, mixed> $row */
    private static function nullableId(array $row, string $column): ?string
    {
        $hex = Row::nullableString($row, $column);

        return $hex === null ? null : Uuid::fromHex($hex);
    }

    /**
     * @param list<string> $roleHexIds
     * @return array<string, list<string>>
     */
    private function permissions(array $roleHexIds): array
    {
        if ($roleHexIds === []) {
            return [];
        }

        $permissions = [];
        foreach (
            $this->connection->executeQuery(
                'SELECT DISTINCT resource_code, permission_code FROM role_permissions WHERE role_id IN ('
                . implode(',', array_fill(0, count($roleHexIds), 'UNHEX(?)'))
                . ') ORDER BY resource_code, permission_code',
                $roleHexIds,
            )->fetchAllAssociative() as $row
        ) {
            $permissions[Row::string($row, 'resource_code')][] = Row::string($row, 'permission_code');
        }

        return $permissions;
    }

    /**
     * @param list<string> $roleHexIds
     * @return array<string, DataScope>
     */
    private function scopes(array $roleHexIds): array
    {
        if ($roleHexIds === []) {
            return [];
        }

        $scopes = [];
        foreach (
            $this->connection->executeQuery(
                'SELECT resource_code, scope FROM role_scopes WHERE role_id IN ('
                . implode(',', array_fill(0, count($roleHexIds), 'UNHEX(?)')) . ')',
                $roleHexIds,
            )->fetchAllAssociative() as $row
        ) {
            $resource = Row::string($row, 'resource_code');
            $scope = DataScope::from(Row::string($row, 'scope'));
            $scopes[$resource] = isset($scopes[$resource]) ? $scopes[$resource]->widest($scope) : $scope;
        }

        return $scopes;
    }
}
