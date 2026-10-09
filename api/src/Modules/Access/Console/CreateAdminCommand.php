<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Console;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Domain\PasswordHasher;
use Soltec\Modules\Access\Domain\PasswordPolicy;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Access\Persistence\RoleRepository;
use Soltec\Modules\Access\Persistence\UserRepository;

/**
 * `php api/bin/console user:create-admin`: creates the first administrator from the hosting terminal.
 * It exposes no route and refuses to run when an active administrator already exists (ADR-0012).
 */
final class CreateAdminCommand
{
    public const NAME = 'user:create-admin';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly UserRepository $users,
        private readonly RoleRepository $roles,
        private readonly PasswordHasher $hasher,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return int the process exit code: 0 on success */
    public function run(ConsoleIo $io): int
    {
        if ($this->users->hasActiveAdministrator()) {
            $io->writeLine('An administrator already exists. Create further users from the application.');

            return 1;
        }
        $roleId = $this->roles->findIdByCode('admin');
        if ($roleId === null) {
            $io->writeLine('The "admin" role is missing: apply the database migrations first.');

            return 1;
        }

        $email = mb_strtolower(trim($io->ask('Email: ')));
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false || mb_strlen($email) > 190) {
            $io->writeLine('That is not a valid email address.');

            return 1;
        }
        $name = trim($io->ask('Name [Administrador]: '));
        $name = $name === '' ? 'Administrador' : $name;
        if (mb_strlen($name) > 150) {
            $io->writeLine('The name is too long (150 characters at most).');

            return 1;
        }

        $password = $io->askSecret('Password: ');
        $violation = PasswordPolicy::violation($password, $email);
        if ($violation !== null) {
            $io->writeLine(sprintf('The password is not acceptable (%s): use 12 to 72 characters.', $violation));

            return 1;
        }
        if ($io->askSecret('Repeat the password: ') !== $password) {
            $io->writeLine('The passwords do not match.');

            return 1;
        }

        $id = Uuid::v7();
        $now = $this->clock->now();
        $this->connection->transactional(function () use ($id, $email, $name, $password, $roleId, $now): void {
            // The person chose this password themselves, so it does not have to be changed at first login.
            $this->users->insert($id, 'internal', $name, $email, $this->hasher->hash($password), false, $now);
            $this->users->replaceRoles($id, [$roleId]);
            $this->audit->record(ActorContext::system(), 'create', 'users', $id, null, [
                'type' => 'internal',
                'name' => $name,
                'email' => $email,
                'role_ids' => [$roleId],
                'is_active' => true,
                'source' => 'console',
            ]);
        });

        $io->writeLine(sprintf('Administrator %s created.', $email));

        return 0;
    }
}
