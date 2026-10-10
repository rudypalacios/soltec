<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Doctrine\DBAL\Exception\ForeignKeyConstraintViolationException;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Uuid;

/** What the migrations promise: seeded catalogs, uniqueness among active rows and no physical deletes. */
final class SchemaTest extends AccessTestCase
{
    public function testSeedsTheCatalogsAndTheImmutableAdminRole(): void
    {
        self::assertSame(
            ['company', 'departments', 'financial_settings', 'roles', 'sequences', 'users'],
            $this->connection->fetchFirstColumn('SELECT code FROM resources ORDER BY code'),
        );
        self::assertSame(
            ['create', 'deactivate', 'edit', 'view'],
            $this->connection->fetchFirstColumn('SELECT code FROM permissions ORDER BY code'),
        );

        $role = $this->connection->fetchAssociative(
            "SELECT is_system, user_type, deleted_at FROM roles WHERE code = 'admin'",
        );
        self::assertIsArray($role);
        self::assertSame(1, Row::int($role, 'is_system'));
        self::assertSame('internal', $role['user_type']);
        self::assertNull($role['deleted_at']);
        self::assertSame(
            18,
            $this->countRows('SELECT COUNT(*) FROM role_permissions'),
            'Access and departments have every verb; the settings only view and edit.',
        );
        self::assertSame(
            array_fill(0, 6, 'all'),
            $this->connection->fetchFirstColumn('SELECT scope FROM role_scopes ORDER BY resource_code'),
        );
    }

    public function testAnActiveEmailCannotBeRepeatedButADeactivatedOneCanBeReused(): void
    {
        $first = $this->createUser('same@example.com');

        try {
            $this->createUser('SAME@example.com');
            self::fail('Two active users cannot share an email.');
        } catch (UniqueConstraintViolationException) {
            // Expected: the generated active_email column carries the unique index.
        }

        $this->connection->executeStatement(
            'UPDATE users SET deleted_at = NOW(3) WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($first['id'])],
        );
        $this->createUser('same@example.com');
        self::assertSame(2, $this->countRows('SELECT COUNT(*) FROM users'));
    }

    public function testTheDatabaseRefusesToDeleteWhatIsStillReferenced(): void
    {
        $role = $this->createRole('In use');
        $this->createUser('holder@example.com', [$role]);

        $this->expectException(ForeignKeyConstraintViolationException::class);
        $this->connection->executeStatement('DELETE FROM roles WHERE id = UNHEX(:id)', ['id' => Uuid::toHex($role)]);
    }

    public function testRunningTheSeedTwiceChangesNothing(): void
    {
        $adminBefore = $this->adminRoleId();

        $this->applySeedAgain();

        self::assertSame(1, $this->countRows("SELECT COUNT(*) FROM roles WHERE code = 'admin'"));
        self::assertSame($adminBefore, $this->adminRoleId());
        self::assertSame(18, $this->countRows('SELECT COUNT(*) FROM role_permissions'));
        self::assertSame(6, $this->countRows('SELECT COUNT(*) FROM role_scopes'));
    }

    public function testAccountTokensAreUniqueByHashAndKeepTheirUser(): void
    {
        $user = $this->createUser('tokens@example.com');
        $insert = 'INSERT INTO account_tokens (id, user_id, purpose, token_hash, expires_at, created_at) '
            . "VALUES (UNHEX(:id), UNHEX(:user), 'invitation', :hash, NOW(3), NOW(3))";
        $row = ['id' => Uuid::toHex(Uuid::v7()), 'user' => Uuid::toHex($user['id']), 'hash' => str_repeat('a', 64)];
        $this->connection->executeStatement($insert, $row);

        try {
            $this->connection->executeStatement($insert, ['id' => Uuid::toHex(Uuid::v7())] + $row);
            self::fail('Two tokens cannot share a hash.');
        } catch (UniqueConstraintViolationException) {
            // Expected: a link maps to exactly one row.
        }
        try {
            $this->connection->executeStatement('DELETE FROM users WHERE id = UNHEX(:id)', ['id' => $row['user']]);
            self::fail('A user with tokens cannot be deleted.');
        } catch (ForeignKeyConstraintViolationException) {
            // Expected: nothing is deleted physically.
        }
    }
}
