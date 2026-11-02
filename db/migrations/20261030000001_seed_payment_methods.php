<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Starting payment methods (PM7), chosen by the user on 2026-10-30. "Crédito" is left out on purpose: it is a payment
 * term (days to pay), not a method, and it is not decided yet. The company adds or renames the rest from the
 * parameters screen. Idempotent, and it uses no application class because the deployment applies migrations before it
 * uploads the new code.
 */
final class SeedPaymentMethods extends AbstractMigration
{
    private const METHODS = ['Efectivo', 'Tarjeta', 'Cheque', 'Transferencia bancaria', 'Depósito bancario'];

    public function up(): void
    {
        foreach (self::METHODS as $name) {
            $this->execute(sprintf(
                "INSERT INTO payment_methods (id, name, created_at, updated_at) "
                . "SELECT UNHEX('%s'), '%s', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3) FROM DUAL "
                . "WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE name = '%s')",
                $this->newUuidV7Hex(),
                $name,
                $name,
            ));
        }
    }

    public function down(): void
    {
        // Rows may already be in use by a client's billing profile, and nothing is deleted physically (CLAUDE.md §4).
    }

    /** A UUID v7 as 32 hexadecimal characters, the same format as the application's Uuid class. */
    private function newUuidV7Hex(): string
    {
        $bytes = substr(pack('J', (int) floor(microtime(true) * 1000)), 2) . random_bytes(10);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x70);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);

        return bin2hex($bytes);
    }
}
