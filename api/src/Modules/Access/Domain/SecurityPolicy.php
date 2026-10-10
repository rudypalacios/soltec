<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Domain;

/**
 * The security rules that are not a company decision. The ones an administrator can change (lockout, password
 * expiry and length, session lifetimes) are in `SecuritySettingsRecord`.
 */
final class SecurityPolicy
{
    /** Bytes bcrypt reads of a password; the rest is ignored, so a longer one is refused. */
    public const PASSWORD_MAX_BYTES = 72;
    /** Two tabs refreshing at once: the loser presents a token that was just rotated and is not treated as theft. */
    public const REFRESH_GRACE_SECONDS = 10;

    public const INVITATION_HOURS = 72;
    public const PASSWORD_RESET_HOURS = 1;
    /** One recovery email per account per this many seconds, so the form cannot be used to flood a mailbox. */
    public const PASSWORD_RESET_COOLDOWN_SECONDS = 60;
}
