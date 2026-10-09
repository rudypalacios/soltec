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

        return [
            $hasAdministrator
                ? RequirementCheck::pass('access.first_admin', 'access', 'An active administrator exists')
                : new RequirementCheck(
                    'access.first_admin',
                    'access',
                    CheckStatus::Warn,
                    'There is no active administrator: nobody can sign in.',
                    'Run "php api/bin/console user:create-admin" in the instance folder (docs/despliegue.md, 2.6).',
                ),
        ];
    }
}
