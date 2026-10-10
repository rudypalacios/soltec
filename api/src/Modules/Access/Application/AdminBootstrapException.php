<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Application;

use RuntimeException;

/** Why the first administrator could not be created. `reason` is a stable code, never user input. */
final class AdminBootstrapException extends RuntimeException
{
    public const ADMIN_EXISTS = 'admin_exists';
    public const ROLE_MISSING = 'role_missing';
    public const INVALID_EMAIL = 'invalid_email';
    public const NAME_TOO_LONG = 'name_too_long';
    /** Prefix of the password policy violations, for example `password_too_short`. */
    public const PASSWORD_PREFIX = 'password_';

    public function __construct(public readonly string $reason)
    {
        parent::__construct($reason);
    }
}
