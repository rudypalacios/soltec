<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Soltec\Kernel\Db\Row;

/** The migration that tells which resources have an owner and repairs roles the new matrix rules would reject. */
final class ResourceScopedMigrationTest extends AccessTestCase
{
    private const MIGRATION = '20261013000001';

    public function testItGivesViewToTheRolesThatHoldOtherActionsWithoutIt(): void
    {
        // Created through the repository, the way data predating the rule exists: no validation in between.
        $broken = $this->createRole('Broken', [
            'departments' => ['edit', 'deactivate'],
            'users' => ['view', 'create'],
            'margin_levels' => ['create'],
        ]);

        $this->applyMigrationAgain(self::MIGRATION);

        self::assertSame(['deactivate', 'edit', 'view'], $this->actionsOf($broken, 'departments'));
        self::assertSame(['create', 'view'], $this->actionsOf($broken, 'users'));
        self::assertSame(['create', 'view'], $this->actionsOf($broken, 'margin_levels'));
    }

    public function testItCanBeRepeatedWithoutChangingAnything(): void
    {
        $role = $this->createRole('Reader', ['departments' => ['view']]);

        $this->applyMigrationAgain(self::MIGRATION);
        $this->applyMigrationAgain(self::MIGRATION);

        self::assertSame(['view'], $this->actionsOf($role, 'departments'));
        self::assertSame(
            ['audit_logs', 'clients', 'contacts', 'users'],
            $this->connection->fetchFirstColumn('SELECT code FROM resources WHERE scoped = 1 ORDER BY code'),
        );
    }

    /** @return list<string> */
    private function actionsOf(string $roleId, string $resource): array
    {
        return array_map(
            Row::scalarString(...),
            $this->connection->fetchFirstColumn(
                'SELECT permission_code FROM role_permissions WHERE role_id = UNHEX(:id) AND resource_code = :resource '
                . 'ORDER BY permission_code',
                ['id' => str_replace('-', '', $roleId), 'resource' => $resource],
            ),
        );
    }
}
