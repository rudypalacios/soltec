<?php

declare(strict_types=1);

namespace Soltec\Kernel\Auth;

/**
 * Who is making the request, with the permissions and scopes read from the database for this request.
 * The check denies by default: no row, no permission.
 */
final class CurrentUser
{
    public const ADMIN_ROLE_CODE = 'admin';

    /**
     * @param list<RoleRef> $roles
     * @param array<string, list<string>> $permissions actions by resource code
     * @param array<string, DataScope> $scopes scope by resource code
     */
    public function __construct(
        public readonly string $id,
        public readonly string $deviceId,
        public readonly string $type,
        public readonly string $name,
        public readonly string $email,
        public readonly array $roles,
        public readonly array $permissions,
        public readonly array $scopes,
        public readonly bool $restricted,
    ) {
    }

    public function can(string $resource, string $action): bool
    {
        return in_array($action, $this->permissions[$resource] ?? [], true);
    }

    public function scopeFor(string $resource): DataScope
    {
        return $this->scopes[$resource] ?? DataScope::Own;
    }

    public function isAdmin(): bool
    {
        foreach ($this->roles as $role) {
            if ($role->code === self::ADMIN_ROLE_CODE) {
                return true;
            }
        }

        return false;
    }
}
