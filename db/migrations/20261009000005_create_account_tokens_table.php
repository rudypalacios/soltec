<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 1.1b: the single-use links sent by email, to accept an invitation and to reset a password. Only the SHA-256
 * of the token is stored, so a copy of the database cannot be used to open a link (docs/arquitectura/erd/
 * 01-fundaciones.md, `account_tokens`). Idempotent, like the other migrations.
 */
final class CreateAccountTokensTable extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS account_tokens ('
            . 'id BINARY(16) NOT NULL, '
            . 'user_id BINARY(16) NOT NULL, '
            . "purpose ENUM('invitation','password_reset') NOT NULL, "
            . 'token_hash CHAR(64) NOT NULL, '
            . 'expires_at DATETIME(3) NOT NULL, '
            . 'used_at DATETIME(3) NULL, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_account_tokens_hash (token_hash), '
            . 'KEY idx_account_tokens_user (user_id, purpose, created_at), '
            . 'CONSTRAINT fk_account_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        );
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS account_tokens');
    }
}
