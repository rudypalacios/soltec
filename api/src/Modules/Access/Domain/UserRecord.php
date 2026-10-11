<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Auth\RoleRef;
use Soltec\Kernel\Db\Timestamps;

/** A user row with its roles. */
final class UserRecord
{
    /** @param list<RoleRef> $roles */
    public function __construct(
        public readonly string $id,
        public readonly string $type,
        public readonly string $name,
        public readonly string $email,
        public readonly ?string $passwordHash,
        public readonly ?DateTimeImmutable $passwordChangedAt,
        public readonly bool $mustChangePassword,
        public readonly int $failedAttempts,
        public readonly ?DateTimeImmutable $lockedUntil,
        public readonly ?DateTimeImmutable $lastLoginAt,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $updatedAt,
        public readonly int $version,
        public readonly ?DateTimeImmutable $deletedAt,
        public readonly ?NamedRef $department = null,
        public readonly ?NamedRef $manager = null,
        public readonly array $roles = [],
    ) {
    }

    /** @param list<RoleRef> $roles */
    public function withRoles(array $roles): self
    {
        return new self(
            $this->id,
            $this->type,
            $this->name,
            $this->email,
            $this->passwordHash,
            $this->passwordChangedAt,
            $this->mustChangePassword,
            $this->failedAttempts,
            $this->lockedUntil,
            $this->lastLoginAt,
            $this->createdAt,
            $this->updatedAt,
            $this->version,
            $this->deletedAt,
            $this->department,
            $this->manager,
            $roles,
        );
    }

    public function isActive(): bool
    {
        return $this->deletedAt === null;
    }

    /** Created by an administrator and not yet accepted: there is no password until the person sets one. */
    public function invitationPending(): bool
    {
        return $this->passwordHash === null && $this->isActive();
    }

    public function isLocked(DateTimeImmutable $now): bool
    {
        return $this->lockedUntil !== null && $this->lockedUntil > $now;
    }

    public function passwordExpired(DateTimeImmutable $now, int $expiryDays): bool
    {
        return $this->passwordChangedAt === null
            || $this->passwordChangedAt->modify(sprintf('+%d days', $expiryDays)) <= $now;
    }

    public function hasAdminRole(): bool
    {
        foreach ($this->roles as $role) {
            if ($role->code === 'admin') {
                return true;
            }
        }

        return false;
    }

    /** @return list<string> */
    public function roleIds(): array
    {
        return array_map(static fn (RoleRef $role): string => $role->id, $this->roles);
    }

    /** @return array<string, mixed> the `User` schema of the contract */
    public function toApi(DateTimeImmutable $now): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'name' => $this->name,
            'email' => $this->email,
            'roles' => array_map(static fn (RoleRef $role): array => $role->toArray(), $this->roles),
            'department' => $this->department?->toArray(),
            'manager' => $this->manager?->toArray(),
            'is_active' => $this->isActive(),
            'must_change_password' => $this->mustChangePassword,
            'invitation_pending' => $this->invitationPending(),
            'password_changed_at' => Timestamps::toIsoOrNull($this->passwordChangedAt),
            'last_login_at' => Timestamps::toIsoOrNull($this->lastLoginAt),
            'locked_until' => $this->isLocked($now) ? Timestamps::toIsoOrNull($this->lockedUntil) : null,
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
    }
}
