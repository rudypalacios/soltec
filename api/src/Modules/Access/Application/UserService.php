<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Application;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\DeadlockException;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Auth\DataScope;
use Soltec\Kernel\Auth\Team;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Domain\UserFilter;
use Soltec\Modules\Access\Domain\UserRecord;
use Soltec\Modules\Access\Persistence\AccountTokenRepository;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Access\Persistence\RoleRepository;
use Soltec\Modules\Access\Persistence\SessionRepository;
use Soltec\Modules\Access\Persistence\UserRepository;

/**
 * Administration of internal users with the protections against locking everybody out (ADR-0012, 7.1), and their
 * place in the organization: department and direct manager (slice 1.2). Only internal users have them; an external
 * user (a client) is reached through its client, never through the hierarchy.
 */
final class UserService
{
    private const ENTITY = 'users';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly UserRepository $users,
        private readonly RoleRepository $roles,
        private readonly SessionRepository $sessions,
        private readonly CredentialService $credentials,
        private readonly AccountTokenRepository $tokens,
        private readonly AdminGuard $adminGuard,
        private readonly AuditLogger $audit,
    ) {
    }

    /**
     * @param string|null $eligibleManagerFor leaves out that user and everybody under them: none of them can be
     *     their manager (it would be a cycle), so a manager picker only offers valid choices
     * @return array{records: list<UserRecord>, total: int}
     */
    public function list(CurrentUser $caller, UserFilter $filter, ?string $eligibleManagerFor, Pagination $page): array
    {
        if ($eligibleManagerFor !== null) {
            $filter = new UserFilter(
                $filter->text,
                $filter->status,
                $filter->type,
                $filter->roleId,
                $filter->departmentId,
                Team::withSubordinates($eligibleManagerFor, $this->users->hierarchy()),
            );
        }

        return $this->users->search($caller, $filter, $page);
    }

    public function get(CurrentUser $caller, string $id): UserRecord
    {
        return $this->users->find($id, $caller) ?? throw ApiException::notFound();
    }

    /**
     * Creates the account without a password and emails the invitation to set one. The account exists even when the
     * email could not be sent: the administrator can resend it.
     *
     * @param list<string> $roleIds
     * @return array{user: UserRecord, invitationSent: bool}
     */
    public function create(
        CurrentUser $caller,
        ActorContext $actor,
        string $name,
        string $email,
        array $roleIds,
        ?string $departmentId = null,
        ?string $managerId = null,
    ): array {
        $id = Uuid::v7();
        $now = $this->clock->now();
        try {
            $save = function () use ($caller, $id, $name, $email, $roleIds, $departmentId, $managerId, $actor, $now) {
                $errors = [];
                $roles = $this->roles->findAssignable($roleIds, 'internal');
                if (count($roles) !== count($roleIds)) {
                    $errors[] = ['field' => 'role_ids', 'code' => 'not_found'];
                }
                if ($this->users->findActiveByEmail($email) !== null) {
                    $errors[] = ['field' => 'email', 'code' => 'taken'];
                }
                // A new user has nobody under them yet, so only the manager itself can be wrong, never a cycle.
                array_push($errors, ...$this->organizationErrors($id, $departmentId, $managerId));
                if ($errors !== []) {
                    throw new ValidationException($errors);
                }
                if (!$caller->isAdmin() && $this->grantsAdmin($roles)) {
                    throw ApiException::forbidden();
                }
                $this->assertStaysInScope($caller, $id, $departmentId, $managerId);

                // No password yet: the person chooses it when they accept the invitation (ADR-0017).
                $this->users->insert($id, 'internal', $name, $email, null, false, $now, $departmentId, $managerId);
                $this->users->replaceRoles($id, $roleIds);
                $this->audit->record($actor, 'create', self::ENTITY, $id, null, [
                    'type' => 'internal',
                    'name' => $name,
                    'email' => $email,
                    'role_ids' => $roleIds,
                    'department_id' => $departmentId,
                    'manager_id' => $managerId,
                    'is_active' => true,
                ]);
            };
            $this->connection->transactional($save);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('email', 'taken');
        }

        // Read without the scope: it was checked above, and the caller's team was computed before this user existed.
        $user = $this->users->find($id) ?? throw ApiException::notFound();

        return ['user' => $user, 'invitationSent' => $this->credentials->sendInvitation($user, $actor)];
    }

    /**
     * @param list<string>|null $roleIds null leaves the roles as they are
     * @param OrganizationChange $organization the department and manager sent, if any
     * @throws ApiException 403 `forbidden`, 404, 409 `conflict` or `last_admin`
     */
    public function update(
        CurrentUser $caller,
        ActorContext $actor,
        string $id,
        int $version,
        ?string $name,
        ?string $email,
        ?array $roleIds,
        OrganizationChange $organization = new OrganizationChange(),
    ): UserRecord {
        try {
            $save = function () use ($caller, $actor, $id, $version, $name, $email, $roleIds, $organization): void {
                $target = $this->users->find($id, $caller) ?? throw ApiException::notFound();
                $this->assertMayModify($caller, $target);
                // Locked first, so concurrent changes of manager take the hierarchy rows in the same order.
                $this->users->lockHierarchyNode($id);

                $newDepartmentId = $organization->departmentSent
                    ? $organization->departmentId
                    : $target->department?->id;
                $newManagerId = $organization->managerSent ? $organization->managerId : $target->manager?->id;
                $errors = $this->organizationErrors(
                    $id,
                    $newDepartmentId === $target->department?->id ? null : $newDepartmentId,
                    $newManagerId === $target->manager?->id ? null : $newManagerId,
                    $target->type,
                );
                if ($errors !== []) {
                    throw new ValidationException($errors);
                }
                if ($newDepartmentId !== $target->department?->id || $newManagerId !== $target->manager?->id) {
                    $this->assertStaysInScope($caller, $id, $newDepartmentId, $newManagerId);
                }

                $newName = $name ?? $target->name;
                $newEmail = $email ?? $target->email;
                $emailChanged = $newEmail !== $target->email;
                if ($emailChanged && $target->isActive() && $this->emailTakenByAnother($newEmail, $target)) {
                    throw ValidationException::field('email', 'taken');
                }

                $newRoles = $roleIds === null ? null : $this->roles->findAssignable($roleIds, $target->type);
                if ($roleIds !== null && count($newRoles ?? []) !== count($roleIds)) {
                    throw ValidationException::field('role_ids', 'not_found');
                }
                $rolesChange = $roleIds !== null && $this->differs($roleIds, $target->roleIds());
                if ($rolesChange) {
                    $this->assertRoleChangeAllowed($caller, $target, $newRoles ?? []);
                }

                $saved = $this->users->updateProfile(
                    $id,
                    $version,
                    $newName,
                    $newEmail,
                    $newDepartmentId,
                    $newManagerId,
                    $this->clock->now(),
                );
                if (!$saved) {
                    throw ApiException::conflict();
                }

                $before = [];
                $after = [];
                $changes = [
                    'name' => [$target->name, $newName],
                    'email' => [$target->email, $newEmail],
                    'department_id' => [$target->department?->id, $newDepartmentId],
                    'manager_id' => [$target->manager?->id, $newManagerId],
                ];
                foreach ($changes as $field => [$old, $new]) {
                    if ($old !== $new) {
                        $before[$field] = $old;
                        $after[$field] = $new;
                    }
                }
                if ($rolesChange) {
                    $this->users->replaceRoles($id, $roleIds);
                    $before['role_ids'] = $target->roleIds();
                    $after['role_ids'] = $roleIds;
                }
                if ($emailChanged) {
                    // A link sent to the old address must not work any more; the invitation has to be sent again.
                    $this->tokens->invalidate($id, $this->clock->now());
                }
                $this->audit->record($actor, 'update', self::ENTITY, $id, $before, $after);
            };
            $this->connection->transactional($save);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('email', 'taken');
        } catch (DeadlockException) {
            // Two changes of manager crossed in the same hierarchy; the one that lost can simply be sent again.
            throw ApiException::conflict();
        }

        return $this->get($caller, $id);
    }

    /** Idempotent. Revokes every session of the user. */
    public function deactivate(CurrentUser $caller, ActorContext $actor, string $id): UserRecord
    {
        $this->connection->transactional(function () use ($caller, $actor, $id): void {
            $target = $this->users->find($id, $caller) ?? throw ApiException::notFound();
            if ($target->id === $caller->id) {
                throw ApiException::forbidden('forbidden', 'Nobody can deactivate their own account.');
            }
            $this->assertMayModify($caller, $target);
            if (!$target->isActive()) {
                return;
            }
            if ($target->hasAdminRole()) {
                $this->adminGuard->assertAnotherAdministratorRemains($target->id);
            }

            $now = $this->clock->now();
            $this->users->setDeletedAt($id, $now, $now);
            $this->sessions->revokeUserDevices($id, $now);
            $this->audit->record(
                $actor,
                'deactivate',
                self::ENTITY,
                $id,
                ['is_active' => true],
                ['is_active' => false],
            );
        });

        return $this->get($caller, $id);
    }

    /** Idempotent. The user has to sign in again: their sessions were revoked when they were deactivated. */
    public function reactivate(CurrentUser $caller, ActorContext $actor, string $id): UserRecord
    {
        try {
            $this->connection->transactional(function () use ($caller, $actor, $id): void {
                $target = $this->users->find($id, $caller) ?? throw ApiException::notFound();
                $this->assertMayModify($caller, $target);
                if ($target->isActive()) {
                    return;
                }
                if ($this->emailTakenByAnother($target->email, $target)) {
                    throw ValidationException::field('email', 'taken');
                }

                $this->users->setDeletedAt($id, null, $this->clock->now());
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
            throw ValidationException::field('email', 'taken');
        }

        return $this->get($caller, $id);
    }

    /**
     * The field errors of a new department or manager (null when it does not change). Only internal users belong to
     * the organization. The manager must be another active internal user and must not report, directly or not, to the
     * user: that would make a cycle. Walking up the chain locks each row (see UserRepository::lockHierarchyNode).
     *
     * @return list<array{field: string, code: string}>
     */
    private function organizationErrors(
        string $userId,
        ?string $departmentId,
        ?string $managerId,
        string $userType = 'internal',
    ): array {
        if ($userType !== 'internal') {
            $sent = array_filter(['department_id' => $departmentId, 'manager_id' => $managerId]);

            return array_map(
                static fn (string $field): array => ['field' => $field, 'code' => 'invalid'],
                array_keys($sent),
            );
        }

        $errors = [];
        if ($departmentId !== null && !$this->users->departmentIsActive($departmentId)) {
            $errors[] = ['field' => 'department_id', 'code' => 'not_found'];
        }
        if ($managerId === null) {
            return $errors;
        }
        if ($managerId === $userId) {
            $errors[] = ['field' => 'manager_id', 'code' => 'invalid'];

            return $errors;
        }

        $manager = $this->users->lockHierarchyNode($managerId);
        if ($manager === null || !$manager['is_active'] || $manager['type'] !== 'internal') {
            $errors[] = ['field' => 'manager_id', 'code' => 'not_found'];

            return $errors;
        }
        $visited = [$managerId => true];
        for ($next = $manager['manager_id']; $next !== null && !isset($visited[$next]);) {
            if ($next === $userId) {
                $errors[] = ['field' => 'manager_id', 'code' => 'cycle'];
                break;
            }
            $visited[$next] = true;
            $next = $this->users->lockHierarchyNode($next)['manager_id'] ?? null;
        }

        return $errors;
    }

    /**
     * A caller who does not reach every user must not create or move someone out of their reach: they would lose
     * the record at once. With `team` the user must end up in the caller's team (in their department or under them);
     * `own` reaches only the caller, so it can create nobody. The caller's own record always stays in reach.
     *
     * @throws ApiException 403 `forbidden` for a scope that cannot hold anybody else, 422 `out_of_scope`
     */
    private function assertStaysInScope(
        CurrentUser $caller,
        string $userId,
        ?string $departmentId,
        ?string $managerId,
    ): void {
        $scope = $caller->scopeFor(UserRepository::RESOURCE);
        if ($scope === DataScope::All || $userId === $caller->id) {
            return;
        }
        if ($scope !== DataScope::Team) {
            throw ApiException::forbidden('forbidden', 'This data scope reaches no other user.');
        }

        $people = array_values(array_filter(
            $this->users->hierarchy(),
            static fn (array $person): bool => $person['id'] !== $userId,
        ));
        $people[] = ['id' => $userId, 'manager_id' => $managerId, 'department_id' => $departmentId];
        if (!in_array($userId, Team::members($caller->id, $people), true)) {
            throw new ValidationException([
                ['field' => 'department_id', 'code' => 'out_of_scope'],
                ['field' => 'manager_id', 'code' => 'out_of_scope'],
            ]);
        }
    }

    /** Only an administrator may modify another administrator. */
    private function assertMayModify(CurrentUser $caller, UserRecord $target): void
    {
        if ($target->hasAdminRole() && !$caller->isAdmin()) {
            throw ApiException::forbidden();
        }
    }

    /** @param list<\Soltec\Kernel\Auth\RoleRef> $newRoles */
    private function assertRoleChangeAllowed(CurrentUser $caller, UserRecord $target, array $newRoles): void
    {
        $touchesAdmin = $target->hasAdminRole() !== $this->grantsAdmin($newRoles);
        if ($touchesAdmin && !$caller->isAdmin()) {
            throw ApiException::forbidden();
        }

        if ($target->id === $caller->id) {
            // Nobody grants themselves more access; an administrator may step down only if another one remains.
            if (!$caller->isAdmin()) {
                throw ApiException::forbidden('forbidden', 'Nobody can change their own roles.');
            }
            $this->adminGuard->assertAnotherAdministratorRemains($target->id);

            return;
        }
        if ($target->hasAdminRole() && !$this->grantsAdmin($newRoles) && $target->isActive()) {
            $this->adminGuard->assertAnotherAdministratorRemains($target->id);
        }
    }

    /** @param list<\Soltec\Kernel\Auth\RoleRef> $roles */
    private function grantsAdmin(array $roles): bool
    {
        foreach ($roles as $role) {
            if ($role->code === CurrentUser::ADMIN_ROLE_CODE) {
                return true;
            }
        }

        return false;
    }

    private function emailTakenByAnother(string $email, UserRecord $target): bool
    {
        $owner = $this->users->findActiveByEmail($email);

        return $owner !== null && $owner->id !== $target->id;
    }

    /**
     * @param list<string> $new
     * @param list<string> $current
     */
    private function differs(array $new, array $current): bool
    {
        sort($new);
        sort($current);

        return $new !== $current;
    }
}
