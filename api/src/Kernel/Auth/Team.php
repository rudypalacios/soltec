<?php

declare(strict_types=1);

namespace Soltec\Kernel\Auth;

/**
 * Who belongs to a user's team, the rows the `team` scope reaches: the user, everybody under them through
 * `manager_id` (direct and indirect) and the members of their department (docs/arquitectura/autenticacion-y-roles.md,
 * section 7). Pure, so it is tested without a database; the hierarchy is small enough to walk in PHP once per
 * request, and MySQL 5.7 has no recursive CTE.
 *
 * `$people` is every internal user, active or not (a deactivated manager in the middle must not cut the chain below
 * them), as `{id, manager_id, department_id}`.
 */
final class Team
{
    /**
     * @param list<array{id: string, manager_id: string|null, department_id: string|null}> $people
     * @return list<string> the member ids, the user first
     */
    public static function members(string $userId, array $people): array
    {
        $members = array_fill_keys(self::withSubordinates($userId, $people), true);

        $departmentId = null;
        foreach ($people as $person) {
            if ($person['id'] === $userId) {
                $departmentId = $person['department_id'];
            }
        }
        if ($departmentId !== null) {
            foreach ($people as $person) {
                if ($person['department_id'] === $departmentId) {
                    $members[$person['id']] = true;
                }
            }
        }

        return array_map('strval', array_keys($members));
    }

    /**
     * The user and everybody under them, directly or not. None of them can be the user's manager: it would be a cycle.
     *
     * @param list<array{id: string, manager_id: string|null, department_id: string|null}> $people
     * @return list<string> the user first
     */
    public static function withSubordinates(string $userId, array $people): array
    {
        $subordinates = [];
        foreach ($people as $person) {
            if ($person['manager_id'] !== null) {
                $subordinates[$person['manager_id']][] = $person['id'];
            }
        }

        $found = [$userId => true];
        // The visited set also stops a cycle that the rules should have prevented.
        $pending = [$userId];
        while ($pending !== []) {
            $current = array_pop($pending);
            foreach ($subordinates[$current] ?? [] as $subordinate) {
                if (!isset($found[$subordinate])) {
                    $found[$subordinate] = true;
                    $pending[] = $subordinate;
                }
            }
        }

        return array_map('strval', array_keys($found));
    }
}
