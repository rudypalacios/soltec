<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Application;

use Doctrine\DBAL\Connection;
use Psr\Log\LoggerInterface;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Clock;
use Soltec\Kernel\ConfigurationException;
use Soltec\Kernel\DeferredTasks;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Mail\MailException;
use Soltec\Modules\Access\Domain\PasswordHasher;
use Soltec\Modules\Access\Domain\PasswordPolicy;
use Soltec\Modules\Access\Domain\SecurityPolicy;
use Soltec\Modules\Access\Domain\UserRecord;
use Soltec\Modules\Access\Persistence\AccountTokenRepository;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Access\Persistence\SecuritySettingsRepository;
use Soltec\Modules\Access\Persistence\SessionRepository;
use Soltec\Modules\Access\Persistence\UserRepository;
use Throwable;

/**
 * Invitations and password recovery by single-use email link (ADR-0017). The administrator never sees a password or a
 * link: they only trigger the email.
 */
final class CredentialService
{
    private const ENTITY = 'users';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly UserRepository $users,
        private readonly AccountTokenRepository $tokens,
        private readonly SessionRepository $sessions,
        private readonly PasswordHasher $hasher,
        private readonly AccountMailer $mailer,
        private readonly DeferredTasks $deferred,
        private readonly AuditLogger $audit,
        private readonly LoggerInterface $logger,
        private readonly SecuritySettingsRepository $security,
    ) {
    }

    /**
     * Sends the invitation of a user that has not accepted one yet. A mail failure does not undo anything: the user
     * exists and the invitation can be sent again.
     *
     * @return bool whether the mail was handed to the mail server
     */
    public function sendInvitation(UserRecord $user, ActorContext $actor): bool
    {
        try {
            $this->deliverInvitation($user, $actor);
        } catch (MailException | ConfigurationException $error) {
            $this->logger->error('The invitation email was not sent.', ['exception' => $error]);

            return false;
        }

        return true;
    }

    /**
     * @throws ApiException 403, 404, 409 `invitation_not_pending`, 502 `mail_send_failed`, 503 when mail is not set up
     */
    public function resendInvitation(CurrentUser $caller, ActorContext $actor, string $userId): void
    {
        $user = $this->users->find($userId, $caller) ?? throw ApiException::notFound();
        if ($user->hasAdminRole() && !$caller->isAdmin()) {
            throw ApiException::forbidden();
        }
        if (!$user->invitationPending()) {
            throw ApiException::conflict('invitation_not_pending', 'The user already has a password or is inactive.');
        }

        try {
            $this->deliverInvitation($user, $actor);
        } catch (MailException $error) {
            $this->logger->error('The invitation email was not sent.', ['exception' => $error]);

            throw new ApiException(502, 'mail_send_failed', 'The mail server refused the message');
        } catch (ConfigurationException $error) {
            throw new ApiException(503, 'mail_not_configured', 'Mail is not configured', $error->getMessage());
        }
    }

    /**
     * Sets the password of an invited account. A weak password is rejected before the link is spent.
     *
     * @throws ApiException 400 `link_invalid` or `link_expired`
     * @throws ValidationException `password`
     */
    public function acceptInvitation(string $token, string $password): void
    {
        $now = $this->clock->now();
        $stored = $this->usableToken($token, AccountTokenRepository::INVITATION);
        $user = $this->users->find($stored['userId']);
        if ($user === null || !$user->invitationPending()) {
            throw self::linkInvalid();
        }
        $minLength = $this->security->get()->passwordMinLength;
        $violation = PasswordPolicy::violation($password, $user->email, $minLength);
        if ($violation !== null) {
            throw ValidationException::field('password', $violation, ['password_min_length' => $minLength]);
        }

        $hash = $this->hasher->hash($password);
        $this->connection->transactional(function () use ($stored, $user, $hash, $now): void {
            if (!$this->tokens->consume($stored['id'], $now)) {
                throw self::linkInvalid();
            }
            $this->users->updatePassword($user->id, $hash, false, $now);
            $this->audit->record(self::selfActor($user), 'accept_invitation', self::ENTITY, $user->id, null, null);
        });
    }

    /**
     * Always answers the same, whether the account exists or not: the work happens after the response is sent. Only
     * active accounts that already accepted their invitation can recover a password.
     */
    public function requestPasswordReset(string $email, ActorContext $actor): void
    {
        $this->deferred->defer(function () use ($email, $actor): void {
            $user = $this->users->findActiveByEmail($email);
            if ($user === null || $user->passwordHash === null) {
                return;
            }
            $now = $this->clock->now();
            $last = $this->tokens->lastIssuedAt($user->id, AccountTokenRepository::PASSWORD_RESET);
            if (
                $last !== null
                && $last->modify(sprintf('+%d seconds', SecurityPolicy::PASSWORD_RESET_COOLDOWN_SECONDS)) > $now
            ) {
                return;
            }

            $token = $this->newToken();
            $this->connection->transactional(function () use ($user, $token, $now, $actor): void {
                $this->tokens->issue(
                    $user->id,
                    AccountTokenRepository::PASSWORD_RESET,
                    AuthService::hashToken($token),
                    $now->modify(sprintf('+%d hours', SecurityPolicy::PASSWORD_RESET_HOURS)),
                    $now,
                );
                $this->audit->record($actor, 'password_reset_request', self::ENTITY, $user->id, null, null);
            });
            try {
                $this->mailer->sendPasswordReset($user->email, $user->name, $token);
            } catch (Throwable $error) {
                $this->logger->error('The password recovery email was not sent.', ['exception' => $error]);
            }
        });
    }

    /**
     * The account state is checked again now, not when the link was sent. Success clears the lock and revokes every
     * session of the user.
     *
     * @throws ApiException 400 `link_invalid` or `link_expired`
     * @throws ValidationException `password`
     */
    public function resetPassword(string $token, string $password): void
    {
        $now = $this->clock->now();
        $stored = $this->usableToken($token, AccountTokenRepository::PASSWORD_RESET);
        $user = $this->users->find($stored['userId']);
        if ($user === null || !$user->isActive() || $user->passwordHash === null) {
            throw self::linkInvalid();
        }
        $minLength = $this->security->get()->passwordMinLength;
        $violation = PasswordPolicy::violation($password, $user->email, $minLength);
        if ($violation !== null) {
            throw ValidationException::field('password', $violation, ['password_min_length' => $minLength]);
        }

        $hash = $this->hasher->hash($password);
        $this->connection->transactional(function () use ($stored, $user, $hash, $now): void {
            if (!$this->tokens->consume($stored['id'], $now)) {
                throw self::linkInvalid();
            }
            $this->users->updatePassword($user->id, $hash, false, $now);
            $this->users->clearLock($user->id);
            $this->sessions->revokeUserDevices($user->id, $now);
            $this->audit->record(self::selfActor($user), 'password_reset', self::ENTITY, $user->id, null, null);
        });
    }

    private function deliverInvitation(UserRecord $user, ActorContext $actor): void
    {
        $now = $this->clock->now();
        $token = $this->newToken();
        $this->connection->transactional(function () use ($user, $token, $now, $actor): void {
            $this->tokens->issue(
                $user->id,
                AccountTokenRepository::INVITATION,
                AuthService::hashToken($token),
                $now->modify(sprintf('+%d hours', SecurityPolicy::INVITATION_HOURS)),
                $now,
            );
            $this->audit->record($actor, 'invite', self::ENTITY, $user->id, null, null);
        });
        $this->mailer->sendInvitation($user->email, $user->name, $token);
    }

    /** @return array{id: string, userId: string, expiresAt: \DateTimeImmutable, used: bool} */
    private function usableToken(string $token, string $purpose): array
    {
        $stored = $this->tokens->find(AuthService::hashToken($token), $purpose) ?? throw self::linkInvalid();
        if ($stored['used']) {
            throw self::linkInvalid();
        }
        if ($stored['expiresAt'] <= $this->clock->now()) {
            throw new ApiException(400, 'link_expired', 'Link expired');
        }

        return $stored;
    }

    private function newToken(): string
    {
        return bin2hex(random_bytes(32));
    }

    /** The person acting through an email link has no session, but the trace still names them. */
    private static function selfActor(UserRecord $user): ActorContext
    {
        return new ActorContext($user->id, null, null);
    }

    private static function linkInvalid(): ApiException
    {
        return new ApiException(400, 'link_invalid', 'Link invalid');
    }
}
