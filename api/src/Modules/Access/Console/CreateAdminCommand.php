<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Console;

use Soltec\Modules\Access\Application\AdminBootstrap;
use Soltec\Modules\Access\Application\AdminBootstrapException;

/**
 * `php api/bin/console user:create-admin`: creates the first administrator from the hosting terminal.
 * It exposes no route and refuses to run when an active administrator already exists (ADR-0012).
 */
final class CreateAdminCommand
{
    public const NAME = 'user:create-admin';

    public function __construct(private readonly AdminBootstrap $admin)
    {
    }

    /** @return int the process exit code: 0 on success */
    public function run(ConsoleIo $io): int
    {
        try {
            $this->admin->assertCanCreate();
        } catch (AdminBootstrapException $error) {
            $io->writeLine(
                $error->reason === AdminBootstrapException::ADMIN_EXISTS
                    ? 'An administrator already exists. Create further users from the application.'
                    : 'The "admin" role is missing: apply the database migrations first.',
            );

            return 1;
        }

        $email = mb_strtolower(trim($io->ask('Email: ')));
        if (AdminBootstrap::emailError($email) !== null) {
            $io->writeLine('That is not a valid email address.');

            return 1;
        }
        $name = trim($io->ask('Name [' . AdminBootstrap::DEFAULT_NAME . ']: '));
        if (AdminBootstrap::nameError($name) !== null) {
            $io->writeLine('The name is too long (150 characters at most).');

            return 1;
        }

        $password = $io->askSecret('Password: ');
        $error = $this->admin->passwordError($password, $email);
        if ($error !== null) {
            $io->writeLine(sprintf(
                'The password is not acceptable (%s): use %d to 72 characters.',
                $error,
                $this->admin->passwordMinLength(),
            ));

            return 1;
        }
        if ($io->askSecret('Repeat the password: ') !== $password) {
            $io->writeLine('The passwords do not match.');

            return 1;
        }

        $this->admin->create($email, $name, $password, 'console');
        $io->writeLine(sprintf('Administrator %s created.', $email));

        return 0;
    }
}
