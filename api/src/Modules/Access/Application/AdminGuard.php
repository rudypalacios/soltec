<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Application;

use Soltec\Kernel\Http\ApiException;
use Soltec\Modules\Access\Persistence\UserRepository;

/**
 * The rule that the system never runs out of administrators (docs/arquitectura/autenticacion-y-roles.md, 7.1).
 * It locks the administrators it counts, so it must run inside the transaction of the change it protects.
 */
final class AdminGuard
{
    public function __construct(private readonly UserRepository $users)
    {
    }

    /** @throws ApiException 409 `last_admin` when nobody but the target would remain as administrator */
    public function assertAnotherAdministratorRemains(string $targetUserId): void
    {
        $others = array_filter(
            $this->users->lockActiveAdministratorIds(),
            static fn (string $id): bool => $id !== $targetUserId,
        );
        if ($others === []) {
            throw ApiException::conflict('last_admin', 'The system needs at least one active administrator.');
        }
    }
}
