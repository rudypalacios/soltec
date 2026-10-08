<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration;

use Doctrine\DBAL\Exception\UniqueConstraintViolationException;

/** Documents, with a real database, the "unique among active records" pattern the design relies on. */
final class ScaffoldProbeMigrationTest extends IntegrationTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->call('POST', '/api/system/migrations/apply', $this->deployHeaders());
    }

    public function testTwoActiveRecordsCannotShareACode(): void
    {
        $this->connection->executeStatement("INSERT INTO scaffold_probe (code) VALUES ('A')");

        $this->expectException(UniqueConstraintViolationException::class);
        $this->connection->executeStatement("INSERT INTO scaffold_probe (code) VALUES ('A')");
    }

    public function testADeactivatedRecordFreesItsCodeAndSeveralCanCoexist(): void
    {
        $this->connection->executeStatement("INSERT INTO scaffold_probe (code) VALUES ('A')");
        $this->connection->executeStatement('UPDATE scaffold_probe SET deleted_at = NOW() WHERE id = 1');

        $this->connection->executeStatement("INSERT INTO scaffold_probe (code) VALUES ('A')");
        $this->connection->executeStatement("INSERT INTO scaffold_probe (code, deleted_at) VALUES ('A', NOW())");

        self::assertSame(3, (int) $this->connection->fetchOne('SELECT COUNT(*) FROM scaffold_probe'));
    }
}
