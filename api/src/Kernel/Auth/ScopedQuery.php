<?php

declare(strict_types=1);

namespace Soltec\Kernel\Auth;

use Doctrine\DBAL\Query\QueryBuilder;
use Soltec\Kernel\Uuid;

/**
 * The single place where a data scope becomes a SQL filter. A repository says which column holds the owner
 * of each row; nobody writes the filter by hand.
 *
 * `team` and `client` need departments and clients, which arrive in later slices: until then they match
 * nothing, so a stored scope that is not implemented yet never opens more data than intended.
 */
final class ScopedQuery
{
    /** @param string|null $ownerColumn column with the owner's id, or null for resources without an owner */
    public static function restrict(
        QueryBuilder $query,
        CurrentUser $user,
        string $resource,
        ?string $ownerColumn,
    ): void {
        if ($ownerColumn === null) {
            return;
        }

        match ($user->scopeFor($resource)) {
            DataScope::All => null,
            DataScope::Own => $query
                ->andWhere(sprintf('%s = UNHEX(:scope_owner)', $ownerColumn))
                ->setParameter('scope_owner', Uuid::toHex($user->id)),
            DataScope::Team, DataScope::Client => $query->andWhere('1 = 0'),
        };
    }
}
