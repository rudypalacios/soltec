<?php

declare(strict_types=1);

namespace Soltec\Kernel\Auth;

use Doctrine\DBAL\Query\QueryBuilder;
use Soltec\Kernel\Uuid;

/**
 * The single place where a data scope becomes a SQL filter. A repository says which column holds the owner
 * of each row; nobody writes the filter by hand.
 *
 * `team` reaches the rows owned by a member of the user's team (Team). `client` is the scope of an external user,
 * who reaches their own client through `GET /v1/me/client`, never through a list: here it matches nothing, so a
 * stored scope can never open more data than intended.
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

    /**
     * The same filter for rows that have several owners, kept in a link table (the advisers of a client, ADR-0025):
     * the row is reached when any of its owners is the user (`own`) or a member of their team (`team`).
     *
     * @param string $idColumn column with the id of the row, such as `c.id`
     * @param string $linkTable the table that links rows to owners
     * @param string $linkIdColumn its column with the row id
     * @param string $linkOwnerColumn its column with the owner id
     */
    public static function restrictByLink(
        QueryBuilder $query,
        CurrentUser $user,
        string $resource,
        string $idColumn,
        string $linkTable,
        string $linkIdColumn,
        string $linkOwnerColumn,
    ): void {
        $members = match ($user->scopeFor($resource)) {
            DataScope::All => null,
            DataScope::Own => [$user->id],
            DataScope::Team => self::teamOf($user),
            DataScope::Client => [],
        };
        if ($members === null) {
            return;
        }
        if ($members === []) {
            $query->andWhere('1 = 0');

            return;
        }

        $query->andWhere(sprintf(
            'EXISTS (SELECT 1 FROM %s scope_link WHERE scope_link.%s = %s AND scope_link.%s IN (%s))',
            $linkTable,
            $linkIdColumn,
            $idColumn,
            $linkOwnerColumn,
            self::placeholders($query, $members, 'scope_link'),
        ));
    }

    private static function restrictToTeam(QueryBuilder $query, CurrentUser $user, string $ownerColumn): void
    {
        $query->andWhere(sprintf(
            '%s IN (%s)',
            $ownerColumn,
            self::placeholders($query, self::teamOf($user), 'scope_team'),
        ));
    }

    /** @return list<string> a user built without loading the team (a test, the console) still reaches themselves */
    private static function teamOf(CurrentUser $user): array
    {
        return $user->teamIds === [] ? [$user->id] : $user->teamIds;
    }

    /**
     * Binds the ids and returns the `UNHEX(:name_0), ...` list for an IN clause.
     *
     * @param list<string> $ids
     */
    private static function placeholders(QueryBuilder $query, array $ids, string $prefix): string
    {
        $placeholders = [];
        foreach ($ids as $index => $id) {
            $placeholders[] = sprintf('UNHEX(:%s_%d)', $prefix, $index);
            $query->setParameter(sprintf('%s_%d', $prefix, $index), Uuid::toHex($id));
        }

        return implode(', ', $placeholders);
    }
}
