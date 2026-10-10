<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Domain;

use DateInterval;

/**
 * Session and password parameters.
 *
 * TODO(slice 1.3): these defaults come from the `security_settings` table once general settings exist.
 */
final class SecurityPolicy
{
    public const MAX_FAILED_ATTEMPTS = 3;
    public const LOCKOUT_MINUTES = 15;
    public const PASSWORD_EXPIRY_DAYS = 90;
    public const PASSWORD_MIN_LENGTH = 12;
    public const PASSWORD_MAX_BYTES = 72;
    /** Web sessions end after this much inactivity: every refresh extends them. */
    public const WEB_IDLE_MINUTES = 30;
    public const MOBILE_REFRESH_DAYS = 30;
    /** Two tabs refreshing at once: the loser presents a token that was just rotated and is not treated as theft. */
    public const REFRESH_GRACE_SECONDS = 10;

    public const INVITATION_HOURS = 72;
    public const PASSWORD_RESET_HOURS = 1;
    /** One recovery email per account per this many seconds, so the form cannot be used to flood a mailbox. */
    public const PASSWORD_RESET_COOLDOWN_SECONDS = 60;

    public static function refreshLifetime(string $platform): DateInterval
    {
        return $platform === 'web'
            ? new DateInterval(sprintf('PT%dM', self::WEB_IDLE_MINUTES))
            : new DateInterval(sprintf('P%dD', self::MOBILE_REFRESH_DAYS));
    }
}
