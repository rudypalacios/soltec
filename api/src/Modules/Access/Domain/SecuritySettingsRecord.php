<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Domain;

use DateInterval;
use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/**
 * Lockout, password and session parameters: the only row of `security_settings` (ADR-0012). What does not depend on
 * the company (token lifetimes of the emails, the refresh grace window) stays in `SecurityPolicy`.
 *
 * A change applies from the next event that reads it: sessions already open keep the expiry they were issued with,
 * a new minimum length is checked when a password is set (existing passwords stay valid), a shorter password expiry
 * counts from the date the password was set.
 */
final class SecuritySettingsRecord
{
    /** Inclusive limits [min, max] of each parameter. */
    public const LIMITS = [
        'web_idle_minutes' => [5, 1440],
        'mobile_refresh_days' => [1, 90],
        'max_failed_attempts' => [3, 20],
        'lockout_minutes' => [1, 1440],
        'password_expiry_days' => [30, 365],
        // Only upwards: 12 is the floor the ADR fixes, 72 bytes the most bcrypt reads.
        'password_min_length' => [12, 72],
    ];

    public function __construct(
        public readonly string $id,
        public readonly int $webIdleMinutes,
        public readonly int $mobileRefreshDays,
        public readonly int $maxFailedAttempts,
        public readonly int $lockoutMinutes,
        public readonly int $passwordExpiryDays,
        public readonly int $passwordMinLength,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $updatedAt,
        public readonly int $version,
    ) {
    }

    /** How long a refresh token issued now on this platform lives: idle time on the web, a fixed span on mobile. */
    public function refreshLifetime(string $platform): DateInterval
    {
        return $platform === 'web'
            ? new DateInterval(sprintf('PT%dM', $this->webIdleMinutes))
            : new DateInterval(sprintf('P%dD', $this->mobileRefreshDays));
    }

    public function lockoutUntil(DateTimeImmutable $now): DateTimeImmutable
    {
        return $now->modify(sprintf('+%d minutes', $this->lockoutMinutes));
    }

    public function passwordExpiresAt(DateTimeImmutable $changedAt): DateTimeImmutable
    {
        return $changedAt->modify(sprintf('+%d days', $this->passwordExpiryDays));
    }

    /** @return array<string, mixed> the `SecuritySettings` schema of the contract */
    public function toApi(): array
    {
        return $this->auditData() + [
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
    }

    /** @return array<string, int> the fields an audit entry compares */
    public function auditData(): array
    {
        return [
            'web_idle_minutes' => $this->webIdleMinutes,
            'mobile_refresh_days' => $this->mobileRefreshDays,
            'max_failed_attempts' => $this->maxFailedAttempts,
            'lockout_minutes' => $this->lockoutMinutes,
            'password_expiry_days' => $this->passwordExpiryDays,
            'password_min_length' => $this->passwordMinLength,
        ];
    }
}
