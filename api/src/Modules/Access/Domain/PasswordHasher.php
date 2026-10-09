<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Domain;

/** Hashing with the PHP default algorithm and automatic rehash (ADR-0012). */
final class PasswordHasher
{
    private ?string $decoy = null;

    public function hash(string $password): string
    {
        return password_hash($password, PASSWORD_DEFAULT);
    }

    /**
     * Verifies against the user's hash, or against a decoy when there is none, so an unknown email costs the
     * same time as a wrong password.
     */
    public function verify(?string $hash, string $password): bool
    {
        if ($hash === null) {
            password_verify($password, $this->decoy ??= $this->hash(bin2hex(random_bytes(16))));

            return false;
        }

        return password_verify($password, $hash);
    }

    public function needsRehash(string $hash): bool
    {
        return password_needs_rehash($hash, PASSWORD_DEFAULT);
    }
}
