<?php

declare(strict_types=1);

namespace Soltec\Kernel\Auth;

use Doctrine\DBAL\Query\QueryBuilder;
use Soltec\Kernel\Uuid;

/**
 * The single place where a data scope becomes a SQL filter. A repository says which column holds the owner
 * of each row; nobody writes the filter by hand.
 *
 * `team` reaches the rows owned by a member of the user's team (Team). `client` needs clients, which arrive with the
 * client portal: until then it matches nothing, so a stored scope that is not implemented yet never opens more data
 * than intended.
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
            DataScope::Team => self::restrictToTeam($query, $user, $ownerColumn),
            DataScope::Client => $query->andWhere('1 = 0'),
        };
    }

    private static function restrictToTeam(QueryBuilder $query, CurrentUser $user, string $ownerColumn): void
    {
        // A user built without loading the team (a test, the console) still reaches their own rows.
        $members = $user->teamIds === [] ? [$user->id] : $user->teamIds;
        $placeholders = [];
        foreach ($members as $index => $memberId) {
            $placeholders[] = sprintf('UNHEX(:scope_team_%d)', $index);
            $query->setParameter('scope_team_' . $index, Uuid::toHex($memberId));
        }
        $query->andWhere(sprintf('%s IN (%s)', $ownerColumn, implode(', ', $placeholders)));
    }
}
