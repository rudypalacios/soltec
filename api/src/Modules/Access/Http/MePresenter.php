<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Http;

use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Auth\DataScope;
use Soltec\Kernel\Auth\RoleRef;

/** The `Me` schema of the contract. */
final class MePresenter
{
    /** @return array<string, mixed> */
    public static function toArray(CurrentUser $user): array
    {
        return [
            'id' => $user->id,
            'type' => $user->type,
            'name' => $user->name,
            'email' => $user->email,
            'roles' => array_map(static fn (RoleRef $role): array => $role->toArray(), $user->roles),
            // Empty PHP arrays would encode as JSON lists; the contract says objects.
            'permissions' => (object) $user->permissions,
            'scopes' => (object) array_map(static fn (DataScope $scope): string => $scope->value, $user->scopes),
        ];
    }
}
