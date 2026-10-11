<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Application;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Domain\PasswordHasher;
use Soltec\Modules\Access\Domain\PasswordPolicy;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Access\Persistence\RoleRepository;
use Soltec\Modules\Access\Persistence\SecuritySettingsRepository;
use Soltec\Modules\Access\Persistence\UserRepository;

/**
 * Creates the first administrator. Two entrances share it: the console command and the deployment step that reads
 * ADMIN_EMAIL / ADMIN_PASSWORD from the .env (ADR-0012). It never overwrites anything: with an active administrator
 * already in place it refuses.
 */
final class AdminBootstrap
{
    public const DEFAULT_NAME = 'Administrador';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly UserRepository $users,
        private readonly RoleRepository $roles,
        private readonly PasswordHasher $hasher,
        private readonly AuditLogger $audit,
        private readonly SecuritySettingsRepository $security,
    ) {
    }

    /** @throws AdminBootstrapException ADMIN_EXISTS or ROLE_MISSING */
    public function assertCanCreate(): void
    {
        if ($this->users->hasActiveAdministrator()) {
            throw new AdminBootstrapException(AdminBootstrapException::ADMIN_EXISTS);
        }
        $this->adminRoleId();
    }

    /** @return string|null the reason code, or null when the email is acceptable */
    public static function emailError(string $email): ?string
    {
        return filter_var($email, FILTER_VALIDATE_EMAIL) === false || mb_strlen($email) > 190
            ? AdminBootstrapException::INVALID_EMAIL
            : null;
    }

    public static function nameError(string $name): ?string
    {
        return mb_strlen($name) > 150 ? AdminBootstrapException::NAME_TOO_LONG : null;
    }

    public function passwordError(string $password, string $email): ?string
    {
        $violation = PasswordPolicy::violation($password, $email, $this->passwordMinLength());

        return $violation === null ? null : AdminBootstrapException::PASSWORD_PREFIX . $violation;
    }

    /**
     * The password is hashed here and goes nowhere else: not to the audit log, not to a response.
     *
     * @param string $source where the request came from (`console` or `deploy`), kept in the audit log
     * @throws AdminBootstrapException
     */
    public function create(string $email, string $name, string $password, string $source): void
    {
        $this->assertCanCreate();
        $email = mb_strtolower(trim($email));
        $name = trim($name) === '' ? self::DEFAULT_NAME : trim($name);
        $reason = self::emailError($email) ?? self::nameError($name) ?? $this->passwordError($password, $email);
        if ($reason !== null) {
            throw new AdminBootstrapException($reason);
        }

        $roleId = $this->adminRoleId();
        $id = Uuid::v7();
        $now = $this->clock->now();
        $this->connection->transactional(function () use ($id, $email, $name, $password, $roleId, $source, $now): void {
            // The person chose this password themselves, so it does not have to be changed at first login.
            $this->users->insert($id, 'internal', $name, $email, $this->hasher->hash($password), false, $now);
            $this->users->replaceRoles($id, [$roleId]);
            $this->audit->record(ActorContext::system(), 'create', 'users', $id, null, [
                'type' => 'internal',
                'name' => $name,
                'email' => $email,
                'role_ids' => [$roleId],
                'is_active' => true,
                'source' => $source,
            ]);
        });
    }

    /** The minimum the company configured, to tell the person at the terminal what is expected. */
    public function passwordMinLength(): int
    {
        return $this->security->get()->passwordMinLength;
    }

    private function adminRoleId(): string
    {
        return $this->roles->findIdByCode('admin')
            ?? throw new AdminBootstrapException(AdminBootstrapException::ROLE_MISSING);
    }
}
