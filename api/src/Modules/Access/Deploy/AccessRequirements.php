<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Deploy;

use Doctrine\DBAL\Exception as DbalException;
use Soltec\Kernel\Config;
use Soltec\Kernel\ConfigurationException;
use Soltec\Kernel\Db\ConnectionFactory;
use Soltec\Kernel\Deploy\Requirements\CheckStatus;
use Soltec\Kernel\Deploy\Requirements\ModuleRequirements;
use Soltec\Kernel\Deploy\Requirements\RequirementCheck;
use Soltec\Modules\Access\Persistence\UserRepository;

/** Access requirements: somebody can sign in, that is, an active administrator exists. */
final class AccessRequirements implements ModuleRequirements
{
    public function __construct(private readonly Config $config)
    {
    }

    /** @return list<RequirementCheck> */
    public function checks(): array
    {
        try {
            $users = new UserRepository(ConnectionFactory::create($this->config));
            $hasAdministrator = $users->hasActiveAdministrator();
        } catch (ConfigurationException | DbalException) {
            // No database, or no tables yet: the database checks already say so and this one cannot be answered.
            return [];
        }

        $checks = [
            $hasAdministrator
                ? RequirementCheck::pass('access.first_admin', 'access', 'An active administrator exists')
                : new RequirementCheck(
                    'access.first_admin',
                    'access',
                    CheckStatus::Warn,
                    'There is no active administrator: nobody can sign in.',
                    'Set ADMIN_EMAIL and ADMIN_PASSWORD in the .env and deploy again, or run "php api/bin/console '
                    . 'user:create-admin" with PHP 8.3 in the instance folder (docs/despliegue.md, 2.6).',
                ),
        ];
        if ($hasAdministrator && $this->config->optionalString('ADMIN_PASSWORD') !== null) {
            // A plain-text password on disk has no reason to stay once the account exists.
            $checks[] = new RequirementCheck(
                'access.admin_password_in_env',
                'access',
                CheckStatus::Warn,
                'ADMIN_PASSWORD is still in the .env although an administrator exists.',
                'Remove ADMIN_PASSWORD (and ADMIN_EMAIL, ADMIN_NAME) from the .env.',
            );
        }

        return $checks;
    }
}
