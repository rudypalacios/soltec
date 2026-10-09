<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Soltec\Modules\Access\Console\CreateAdminCommand;
use Soltec\Tests\Support\ScriptedConsole;

final class CreateAdminCommandTest extends AccessTestCase
{
    public function testCreatesTheFirstAdministratorWhoCanThenSignIn(): void
    {
        $io = new ScriptedConsole(['  Boss@Example.com ', 'The Boss'], [self::PASSWORD, self::PASSWORD]);

        self::assertSame(0, $this->command()->run($io));

        $response = $this->login('boss@example.com');
        self::assertSame(200, $response->getStatusCode());
        $body = $this->json($response);
        self::assertFalse($body['password_change_required'], 'The person chose their own password.');
        self::assertSame('The Boss', $this->valueAt($body, 'user', 'name'));
        self::assertSame(['admin'], array_column($this->rowsAt($body, 'user', 'roles'), 'code'));
    }

    public function testRecordsTheCreationInTheAuditLogWithoutAnyPassword(): void
    {
        $this->command()->run(new ScriptedConsole(['boss@example.com', ''], [self::PASSWORD, self::PASSWORD]));

        $entries = $this->auditEntries('users');

        self::assertCount(1, $entries);
        self::assertSame('create', $entries[0]['action']);
        self::assertNull($entries[0]['userId']);
        self::assertSame('console', $entries[0]['after']['source'] ?? null);
        self::assertSame('Administrador', $entries[0]['after']['name'] ?? null);
        self::assertStringNotContainsString('password', (string) json_encode($entries[0]['after']));
    }

    public function testRefusesWhenAnActiveAdministratorAlreadyExists(): void
    {
        $this->createAdmin();
        $io = new ScriptedConsole(['boss@example.com', 'Boss'], [self::PASSWORD, self::PASSWORD]);

        self::assertSame(1, $this->command()->run($io));

        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM users'));
        self::assertStringContainsString('already exists', $io->output());
        self::assertCount(4, $io->unusedAnswers(), 'It must refuse before asking anything.');
    }

    public function testRunsAgainWhenTheOnlyAdministratorWasDeactivated(): void
    {
        $this->createAdmin();
        $this->connection->executeStatement('UPDATE users SET deleted_at = NOW(3)');
        $io = new ScriptedConsole(['boss@example.com', 'Boss'], [self::PASSWORD, self::PASSWORD]);

        self::assertSame(0, $this->command()->run($io));
    }

    public function testRejectsAnInvalidEmailAWeakPasswordAndAMismatch(): void
    {
        $cases = [
            'email' => [['not-an-email', 'Boss'], [self::PASSWORD, self::PASSWORD]],
            'short password' => [['boss@example.com', 'Boss'], ['short', 'short']],
            'password equal to the email' => [['boss.person@example.com', 'Boss'], ['boss.person@example.com', 'x']],
            'mismatch' => [['boss@example.com', 'Boss'], [self::PASSWORD, 'another password 123']],
        ];

        foreach ($cases as $label => [$answers, $secrets]) {
            self::assertSame(1, $this->command()->run(new ScriptedConsole($answers, $secrets)), $label);
        }
        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM users'));
    }

    public function testFailsClearlyWhenTheMigrationsDidNotRun(): void
    {
        $this->connection->executeStatement('SET FOREIGN_KEY_CHECKS = 0');
        $this->connection->executeStatement('DELETE FROM role_permissions');
        $this->connection->executeStatement('DELETE FROM role_scopes');
        $this->connection->executeStatement('DELETE FROM roles');
        $this->connection->executeStatement('SET FOREIGN_KEY_CHECKS = 1');
        $io = new ScriptedConsole([], []);

        try {
            self::assertSame(1, $this->command()->run($io));
            self::assertStringContainsString('migrations', $io->output());
        } finally {
            // The schema is shared between tests: put the seed back for the ones that follow.
            $this->applySeedAgain();
        }
    }

    private function command(): CreateAdminCommand
    {
        return $this->service(CreateAdminCommand::class);
    }
}
