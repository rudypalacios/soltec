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
use Soltec\Modules\Access\Domain\UserRecord;
use Soltec\Modules\Access\Persistence\AccountTokenRepository;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Access\Persistence\RoleRepository;
use Soltec\Modules\Access\Persistence\SessionRepository;
use Soltec\Modules\Access\Persistence\UserRepository;

/** Administration of internal users with the protections against locking everybody out (ADR-0012, 7.1). */
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

    /** @return array{records: list<UserRecord>, total: int} */
    public function list(
        CurrentUser $caller,
        ?string $text,
        string $status,
        ?string $type,
        ?string $roleId,
        Pagination $page,
    ): array {
        return $this->users->search($caller, $text, $status, $type, $roleId, $page);
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
    ): array {
        $errors = [];
        $roles = $this->roles->findAssignable($roleIds, 'internal');
        if (count($roles) !== count($roleIds)) {
            $errors[] = ['field' => 'role_ids', 'code' => 'not_found'];
        }
        if ($this->users->findActiveByEmail($email) !== null) {
            $errors[] = ['field' => 'email', 'code' => 'taken'];
        }
        if ($errors !== []) {
            throw new ValidationException($errors);
        }
        if (!$caller->isAdmin() && $this->grantsAdmin($roles)) {
            throw ApiException::forbidden();
        }

        $id = Uuid::v7();
        $now = $this->clock->now();
        try {
            $save = function () use ($id, $name, $email, $roleIds, $actor, $now): void {
                // No password yet: the person chooses it when they accept the invitation (ADR-0017).
                $this->users->insert($id, 'internal', $name, $email, null, false, $now);
                $this->users->replaceRoles($id, $roleIds);
                $this->audit->record($actor, 'create', self::ENTITY, $id, null, [
                    'type' => 'internal',
                    'name' => $name,
                    'email' => $email,
                    'role_ids' => $roleIds,
                    'is_active' => true,
                ]);
            };
            $this->connection->transactional($save);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('email', 'taken');
        }

        $user = $this->get($caller, $id);

        return ['user' => $user, 'invitationSent' => $this->credentials->sendInvitation($user, $actor)];
    }

    /**
     * @param list<string>|null $roleIds null leaves the roles as they are
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
    ): UserRecord {
        try {
            $save = function () use ($caller, $actor, $id, $version, $name, $email, $roleIds): void {
                $target = $this->users->find($id, $caller) ?? throw ApiException::notFound();
                $this->assertMayModify($caller, $target);

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

                if (!$this->users->updateProfile($id, $version, $newName, $newEmail, $this->clock->now())) {
                    throw ApiException::conflict();
                }

                $before = [];
                $after = [];
                $changes = ['name' => [$target->name, $newName], 'email' => [$target->email, $newEmail]];
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
