<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Deploy;

use Soltec\Kernel\Config;
use Soltec\Kernel\Deploy\PostMigrationStep;
use Soltec\Modules\Access\Application\AdminBootstrap;
use Soltec\Modules\Access\Application\AdminBootstrapException;

/**
 * Creates the first administrator from ADMIN_EMAIL, ADMIN_PASSWORD and, optionally, ADMIN_NAME in the .env, so a
 * host without a usable terminal can still start. It does nothing once an administrator exists, which makes it safe
 * on every deployment. The person removes ADMIN_PASSWORD afterwards (the requirements page reminds them).
 */
final class AdminFromEnvStep implements PostMigrationStep
{
    public const NOT_CONFIGURED = 'not_configured';
    public const INCOMPLETE = 'incomplete';
    public const CREATED = 'created';
    public const EXISTS = 'exists';

    public function __construct(private readonly Config $config, private readonly AdminBootstrap $admin)
    {
    }

    public function name(): string
    {
        return 'first_admin';
    }

    public function run(): string
    {
        $email = $this->config->optionalString('ADMIN_EMAIL');
        $password = $this->config->optionalString('ADMIN_PASSWORD');
        if ($email === null && $password === null) {
            return self::NOT_CONFIGURED;
        }
        if ($email === null || $password === null) {
            return self::INCOMPLETE;
        }

        try {
            $this->admin->create($email, $this->config->optionalString('ADMIN_NAME') ?? '', $password, 'deploy');
        } catch (AdminBootstrapException $error) {
            return $error->reason === AdminBootstrapException::ADMIN_EXISTS ? self::EXISTS : $error->reason;
        }

        return self::CREATED;
    }
}
