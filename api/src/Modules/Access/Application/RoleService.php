<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Application;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Domain\RoleRecord;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Access\Persistence\RoleRepository;

/**
 * Administration of roles (perfiles) and their matrix. A role with permissions on `users` or `roles` is close to
 * being an administrator: whoever may edit roles can widen their own, and that is documented, not prevented.
 */
final class RoleService
{
    private const ENTITY = 'roles';
    /** `client` belongs to external roles, which arrive with the client portal. */
    private const SCOPES_IN_THIS_SLICE = ['own', 'team', 'all'];

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly RoleRepository $roles,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return array{records: list<RoleRecord>, total: int} */
    public function list(?string $text, string $status, ?string $userType, Pagination $page): array
    {
        return $this->roles->search($text, $status, $userType, $page);
    }

    /**
     * The widgets of the signed-in user's home screen: those of their active roles, each once, in order.
     *
     * @return list<string>
     */
    public function dashboardFor(CurrentUser $user): array
    {
        return $this->roles->widgetsOfUser($user->id);
    }

    public function get(string $id): RoleRecord
    {
        return $this->roles->find($id) ?? throw ApiException::notFound();
    }

    /**
     * @param array<array-key, mixed> $permissions
     * @param array<array-key, mixed> $scopes
     * @param list<string> $widgets codes of WidgetCatalog, already checked
     */
    public function create(
        ActorContext $actor,
        string $name,
        ?string $description,
        string $userType,
        array $permissions,
        array $scopes,
        array $widgets = [],
    ): RoleRecord {
        [$permissions, $scopes, $errors] = $this->parseMatrix($permissions, $scopes);
        if ($userType !== 'internal') {
            $errors[] = ['field' => 'user_type', 'code' => 'invalid'];
        }
        if ($errors !== []) {
            throw new ValidationException($errors);
        }

        $id = Uuid::v7();
        try {
            $save = function () use (
                $actor,
                $id,
                $name,
                $description,
                $userType,
                $permissions,
                $scopes,
                $widgets,
            ): void {
                $this->roles->insert($id, $name, $description, $userType, $this->clock->now());
                $this->roles->replaceMatrix($id, $permissions, $scopes);
                $this->roles->replaceWidgets($id, $widgets);
                $this->audit->record($actor, 'create', self::ENTITY, $id, null, [
                    'name' => $name,
                    'description' => $description,
                    'user_type' => $userType,
                    'permissions' => $permissions,
                    'scopes' => $scopes,
                    'widgets' => $widgets,
                ]);
            };
            $this->connection->transactional($save);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('name', 'taken');
        }

        return $this->get($id);
    }

    /**
     * @param array<array-key, mixed>|null $permissions when sent, replaces the whole set
     * @param array<array-key, mixed>|null $scopes when sent, replaces the whole set
     * @param list<string>|null $widgets when sent, replaces the whole list (codes of WidgetCatalog, already checked)
     * @throws ApiException 404, 409 `system_role_immutable` or `conflict`
     */
    public function update(
        ActorContext $actor,
        string $id,
        int $version,
        ?string $name,
        ?string $description,
        bool $descriptionSent,
        ?array $permissions,
        ?array $scopes,
        ?array $widgets = null,
    ): RoleRecord {
        [$parsedPermissions, $parsedScopes, $errors] = $this->parseMatrix($permissions ?? [], $scopes ?? []);
        if ($errors !== []) {
            throw new ValidationException($errors);
        }

        try {
            $save = function () use (
                $actor,
                $id,
                $version,
                $name,
                $description,
                $descriptionSent,
                $permissions,
                $scopes,
                $widgets,
                $parsedPermissions,
                $parsedScopes,
            ): void {
                $role = $this->roles->find($id) ?? throw ApiException::notFound();
                $this->assertNotSystem($role);

                $newName = $name ?? $role->name;
                $newDescription = $descriptionSent ? $description : $role->description;
                if (!$this->roles->updateDetails($id, $version, $newName, $newDescription, $this->clock->now())) {
                    throw ApiException::conflict();
                }

                $newPermissions = $permissions === null ? $role->permissions : $parsedPermissions;
                $newScopes = $scopes === null ? $role->scopes : $parsedScopes;
                if ($permissions !== null || $scopes !== null) {
                    $this->roles->replaceMatrix($id, $newPermissions, $newScopes);
                }

                $newWidgets = $widgets ?? $role->widgets;
                if ($widgets !== null) {
                    $this->roles->replaceWidgets($id, $newWidgets);
                }

                $before = [];
                $after = [];
                $changes = [
                    'name' => [$role->name, $newName],
                    'description' => [$role->description, $newDescription],
                    'permissions' => [$role->permissions, $newPermissions],
                    'scopes' => [$role->scopes, $newScopes],
                    'widgets' => [$role->widgets, $newWidgets],
                ];
                foreach ($changes as $field => [$old, $new]) {
                    if ($old !== $new) {
                        $before[$field] = $old;
                        $after[$field] = $new;
                    }
                }
                $this->audit->record($actor, 'update', self::ENTITY, $id, $before, $after);
            };
            $this->connection->transactional($save);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('name', 'taken');
        }

        return $this->get($id);
    }

    /** Idempotent. A role that active users still hold cannot be deactivated. */
    public function deactivate(ActorContext $actor, string $id): RoleRecord
    {
        $this->connection->transactional(function () use ($actor, $id): void {
            $role = $this->roles->find($id) ?? throw ApiException::notFound();
            $this->assertNotSystem($role);
            if ($role->deletedAt !== null) {
                return;
            }
            if ($this->roles->countActiveUsers($id) > 0) {
                throw ApiException::conflict('conflict', 'The role is still assigned to active users.');
            }

            $now = $this->clock->now();
            $this->roles->setDeletedAt($id, $now, $now);
            $this->audit->record(
                $actor,
                'deactivate',
                self::ENTITY,
                $id,
                ['is_active' => true],
                ['is_active' => false],
            );
        });

        return $this->get($id);
    }

    /** Idempotent. */
    public function reactivate(ActorContext $actor, string $id): RoleRecord
    {
        try {
            $this->connection->transactional(function () use ($actor, $id): void {
                $role = $this->roles->find($id) ?? throw ApiException::notFound();
                $this->assertNotSystem($role);
                if ($role->deletedAt === null) {
                    return;
                }

                $this->roles->setDeletedAt($id, null, $this->clock->now());
                $this->audit->record(
                    $actor,
                    'reactivate',
                    self::ENTITY,
                    $id,
                    ['is_active' => false],
                    ['is_active' => true],
                );
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('name', 'taken');
        }

        return $this->get($id);
    }

    private function assertNotSystem(RoleRecord $role): void
    {
        if ($role->isSystem) {
            throw ApiException::conflict('system_role_immutable', 'System roles cannot be changed.');
        }
    }

    /**
     * Validates the matrix against the catalogs and returns it typed and sorted: the matrix is a set, and sorting
     * makes equal matrices compare equal, so the audit shows only real changes.
     *
     * Resource and permission codes must exist and scopes must be implemented in this slice.
     *
     * @param array<array-key, mixed> $permissions
     * @param array<array-key, mixed> $scopes
     * @return array{
     *     0: array<string, list<string>>, 1: array<string, string>, 2: list<array{field: string, code: string}>
     * }
     */
    private function parseMatrix(array $permissions, array $scopes): array
    {
        $resources = array_column($this->roles->resources(), 'code');
        $actions = array_column($this->roles->permissions(), 'code');
        $errors = [];

        $parsedPermissions = [];
        foreach ($permissions as $resource => $granted) {
            $resource = (string) $resource;
            $field = 'permissions.' . $resource;
            if (!in_array($resource, $resources, true)) {
                $errors[] = ['field' => $field, 'code' => 'not_found'];
                continue;
            }
            $list = $this->actionList($granted, $actions);
            if ($list === null) {
                $errors[] = ['field' => $field, 'code' => 'invalid'];
                continue;
            }
            $parsedPermissions[$resource] = $list;
        }

        $parsedScopes = [];
        foreach ($scopes as $resource => $scope) {
            $resource = (string) $resource;
            $field = 'scopes.' . $resource;
            if (!in_array($resource, $resources, true)) {
                $errors[] = ['field' => $field, 'code' => 'not_found'];
            } elseif (!is_string($scope) || !in_array($scope, self::SCOPES_IN_THIS_SLICE, true)) {
                $errors[] = ['field' => $field, 'code' => 'invalid'];
            } else {
                $parsedScopes[$resource] = $scope;
            }
        }
        ksort($parsedPermissions);
        ksort($parsedScopes);

        return [$parsedPermissions, $parsedScopes, $errors];
    }

    /**
     * @param list<string> $actions the permission codes that exist
     * @return list<string>|null the sorted distinct actions, or null when the value is not a list of known actions
     */
    private function actionList(mixed $granted, array $actions): ?array
    {
        if (!is_array($granted) || !array_is_list($granted)) {
            return null;
        }
        $list = [];
        foreach ($granted as $action) {
            if (!is_string($action) || !in_array($action, $actions, true)) {
                return null;
            }
            $list[] = $action;
        }
        if (count(array_unique($list)) !== count($list)) {
            return null;
        }
        sort($list);

        return $list;
    }
}
