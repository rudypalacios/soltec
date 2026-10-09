<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Domain;

/** The password rules of ADR-0012: 12 to 72 bytes (bcrypt ignores the rest) and different from the email. */
final class PasswordPolicy
{
    /** @return string|null the field error code, or null when the password is acceptable */
    public static function violation(string $password, string $email): ?string
    {
        if (mb_strlen($password) < SecurityPolicy::PASSWORD_MIN_LENGTH) {
            return 'too_short';
        }
        if (strlen($password) > SecurityPolicy::PASSWORD_MAX_BYTES) {
            return 'too_long';
        }

        return mb_strtolower($password) === mb_strtolower($email) ? 'invalid' : null;
    }
}
