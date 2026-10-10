<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Application;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use LogicException;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Auth\JwtService;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Modules\Access\Domain\PasswordHasher;
use Soltec\Modules\Access\Domain\PasswordPolicy;
use Soltec\Modules\Access\Domain\SecurityPolicy;
use Soltec\Modules\Access\Domain\UserRecord;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Access\Persistence\PermissionLoader;
use Soltec\Modules\Access\Persistence\SecuritySettingsRepository;
use Soltec\Modules\Access\Persistence\SessionRepository;
use Soltec\Modules\Access\Persistence\UserRepository;

/** Login, refresh, logout and password change (ADR-0012, docs/arquitectura/autenticacion-y-roles.md). */
final class AuthService
{
    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly JwtService $jwt,
        private readonly PasswordHasher $hasher,
        private readonly UserRepository $users,
        private readonly SessionRepository $sessions,
        private readonly PermissionLoader $permissions,
        private readonly AuditLogger $audit,
        private readonly SecuritySettingsRepository $security,
    ) {
    }

    /**
     * Wrong email, wrong password and a locked account all fail the same way, in about the same time.
     *
     * @param ActorContext $request who is calling: only the address is known before the login succeeds
     * @param string|null $deviceId id returned by an earlier login on this device
     * @throws ApiException 401 `invalid_credentials`
     */
    public function login(
        ActorContext $request,
        string $email,
        string $password,
        string $platform,
        ?string $deviceName,
        ?string $deviceId,
    ): TokenResult {
        $this->jwt->assertConfigured();
        $now = $this->clock->now();
        $user = $this->users->findActiveByEmail($email);
        $locked = $user !== null && $user->isLocked($now);
        $valid = $this->hasher->verify($user?->passwordHash, $password);

        if ($user === null || $locked || !$valid) {
            if ($user !== null && !$locked) {
                $settings = $this->security->get();
                $lockedNow = $this->users->registerFailedLogin(
                    $user->id,
                    $now,
                    $settings->maxFailedAttempts,
                    $settings->lockoutUntil($now),
                );
                // Failed attempts are not logged (anyone could fill the table with made-up emails); the moment an
                // account locks is, because that is what an administrator needs to see.
                if ($lockedNow) {
                    $this->audit->record(
                        new ActorContext(null, null, $request->ip),
                        'lockout',
                        'users',
                        $user->id,
                        null,
                        ['locked_until' => Timestamps::toIso($settings->lockoutUntil($now))],
                    );
                }
            }

            throw ApiException::unauthorized('invalid_credentials');
        }

        $open = function () use ($user, $password, $platform, $deviceName, $deviceId, $now, $request): TokenResult {
            $this->users->registerSuccessfulLogin($user->id, $now);
            if ($user->passwordHash !== null && $this->hasher->needsRehash($user->passwordHash)) {
                $this->users->rehashPassword($user->id, $this->hasher->hash($password));
            }

            $deviceId = ($deviceId === null ? null : $this->sessions->findUsableDeviceId($user->id, $deviceId))
                ?? $this->sessions->createDevice($user->id, $platform, $deviceName, $now);
            $this->sessions->touchDevice($deviceId, $now);
            $refreshToken = $this->issueRefreshToken($deviceId, $platform, $now);
            $this->audit->record(
                new ActorContext($user->id, $deviceId, $request->ip),
                'login',
                'users',
                $user->id,
                null,
                null,
            );

            return $this->result($user, $deviceId, $platform, $refreshToken, $now);
        };

        return $this->connection->transactional($open);
    }

    /**
     * Rotates the refresh token: the presented one is revoked and a new one issued. A token that was already
     * revoked means someone kept a copy: every token of that device is revoked, except inside the grace window
     * for the web, where two tabs may refresh at the same moment.
     *
     * @param bool $fromCookie true on the web, where the cookie jar is shared by every tab
     * @throws ApiException 401 `token_invalid` or `token_expired`
     */
    public function refresh(string $refreshToken, bool $fromCookie): TokenResult
    {
        $this->jwt->assertConfigured();
        $now = $this->clock->now();
        $stored = $this->sessions->findRefreshToken(self::hashToken($refreshToken));
        if ($stored === null || $stored['deviceRevoked']) {
            throw ApiException::unauthorized('token_invalid');
        }

        $user = $this->users->find($stored['userId']);
        if ($user === null || !$user->isActive()) {
            throw ApiException::unauthorized('token_invalid');
        }

        $revokedAt = $stored['revokedAt'];
        if ($revokedAt !== null) {
            return $this->handleRevokedToken($stored, $revokedAt, $fromCookie, $user, $now);
        }
        if ($stored['expiresAt'] <= $now) {
            throw ApiException::unauthorized('token_expired');
        }

        $result = $this->connection->transactional(function () use ($stored, $user, $now) {
            if (!$this->sessions->revokeRefreshToken($stored['id'], $now)) {
                return null;
            }

            $this->sessions->touchDevice($stored['deviceId'], $now);
            $newToken = $this->issueRefreshToken($stored['deviceId'], $stored['platform'], $now);

            return $this->result($user, $stored['deviceId'], $stored['platform'], $newToken, $now, withUser: false);
        });
        if ($result !== null) {
            return $result;
        }

        // Another request rotated the same token between our read and our write: a sibling tab on the web,
        // a copy of the token anywhere else.
        if (!$fromCookie) {
            $this->sessions->revokeDevice($stored['deviceId'], $now);
            throw ApiException::unauthorized('token_invalid');
        }

        return $this->result($user, $stored['deviceId'], $stored['platform'], null, $now, withUser: false);
    }

    public function logout(CurrentUser $user, ActorContext $actor): void
    {
        $this->connection->transactional(function () use ($user, $actor): void {
            $this->sessions->revokeDevice($user->deviceId, $this->clock->now());
            $this->audit->record($actor, 'logout', 'users', $user->id, null, null);
        });
    }

    /**
     * @throws ValidationException `current_password` (`current_password_incorrect`) or `new_password`
     */
    public function changePassword(
        CurrentUser $current,
        ActorContext $actor,
        string $currentPassword,
        string $newPassword,
    ): void {
        $user = $this->users->find($current->id) ?? throw ApiException::unauthorized('token_invalid');
        if (!$this->hasher->verify($user->passwordHash, $currentPassword)) {
            throw ValidationException::field('current_password', 'current_password_incorrect');
        }
        $minLength = $this->security->get()->passwordMinLength;
        $violation = PasswordPolicy::violation($newPassword, $user->email, $minLength)
            ?? ($newPassword === $currentPassword ? 'invalid' : null);
        if ($violation !== null) {
            throw ValidationException::field('new_password', $violation, ['password_min_length' => $minLength]);
        }

        $now = $this->clock->now();
        $this->connection->transactional(function () use ($user, $actor, $newPassword, $current, $now): void {
            $this->users->updatePassword($user->id, $this->hasher->hash($newPassword), false, $now);
            // A stolen session must not survive a password change: every other device signs in again.
            $this->sessions->revokeUserDevices($user->id, $now, $current->deviceId);
            $this->audit->record($actor, 'password_change', 'users', $user->id, null, null);
        });
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    /**
     * @param array{id: string, deviceId: string, userId: string, platform: string, expiresAt: DateTimeImmutable,
     *     revokedAt: DateTimeImmutable|null, deviceRevoked: bool} $stored
     */
    private function handleRevokedToken(
        array $stored,
        DateTimeImmutable $revokedAt,
        bool $fromCookie,
        UserRecord $user,
        DateTimeImmutable $now,
    ): TokenResult {
        $insideGrace = $fromCookie
            && $revokedAt->modify(sprintf('+%d seconds', SecurityPolicy::REFRESH_GRACE_SECONDS)) >= $now;
        if (!$insideGrace) {
            $this->sessions->revokeDevice($stored['deviceId'], $now);
            throw ApiException::unauthorized('token_invalid');
        }

        // The sibling request already put the new refresh token in the shared cookie.
        return $this->result($user, $stored['deviceId'], $stored['platform'], null, $now, withUser: false);
    }

    private function issueRefreshToken(string $deviceId, string $platform, DateTimeImmutable $now): string
    {
        $token = bin2hex(random_bytes(32));
        $this->sessions->insertRefreshToken(
            $deviceId,
            self::hashToken($token),
            $now->add($this->security->get()->refreshLifetime($platform)),
            $now,
        );

        return $token;
    }

    private function result(
        UserRecord $user,
        string $deviceId,
        string $platform,
        ?string $refreshToken,
        DateTimeImmutable $now,
        bool $withUser = true,
    ): TokenResult {
        $restricted = $user->mustChangePassword
            || $user->passwordExpired($now, $this->security->get()->passwordExpiryDays);
        $loaded = $withUser ? $this->permissions->build($user->id, $deviceId, $restricted) : null;
        if ($withUser && $loaded === null) {
            throw new LogicException('The user vanished during login.');
        }

        return new TokenResult(
            $this->jwt->issue($user->id, $deviceId, $restricted),
            $restricted,
            $refreshToken,
            $deviceId,
            $platform,
            $loaded,
        );
    }
}
