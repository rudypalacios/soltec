<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 1.1: users, their roles, and the sessions behind the access tokens (devices and refresh tokens).
 * `department_id`, `client_id` and `contact_id` exist without foreign keys: the tables they point to arrive in
 * slice 1.2 and in Milestone 2.
 */
final class CreateUsersAndSessionsTables extends AbstractMigration
{
    private const TABLE_OPTIONS = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS users ('
            . 'id BINARY(16) NOT NULL, '
            . "type ENUM('internal','external') NOT NULL, "
            . 'name VARCHAR(150) NOT NULL, '
            . 'email VARCHAR(190) NOT NULL, '
            . 'active_email VARCHAR(190) GENERATED ALWAYS AS (IF(deleted_at IS NULL, email, NULL)) STORED, '
            . 'password_hash VARCHAR(255) NULL, '
            . 'password_changed_at DATETIME(3) NULL, '
            . 'must_change_password TINYINT(1) NOT NULL DEFAULT 0, '
            . 'failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0, '
            . 'locked_until DATETIME(3) NULL, '
            . 'last_login_at DATETIME(3) NULL, '
            . 'department_id BINARY(16) NULL, '
            . 'manager_id BINARY(16) NULL, '
            . 'client_id BINARY(16) NULL, '
            . 'contact_id BINARY(16) NULL, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_users_active_email (active_email), '
            . 'KEY idx_users_department (department_id), '
            . 'KEY idx_users_manager (manager_id), '
            . 'KEY idx_users_client (client_id), '
            . 'KEY idx_users_updated (updated_at), '
            . 'CONSTRAINT fk_users_manager FOREIGN KEY (manager_id) REFERENCES users (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );
        $this->execute(
            'CREATE TABLE IF NOT EXISTS user_roles ('
            . 'user_id BINARY(16) NOT NULL, '
            . 'role_id BINARY(16) NOT NULL, '
            . 'PRIMARY KEY (user_id, role_id), '
            . 'KEY idx_user_roles_role (role_id), '
            . 'CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );
        $this->execute(
            'CREATE TABLE IF NOT EXISTS devices ('
            . 'id BINARY(16) NOT NULL, '
            . 'user_id BINARY(16) NOT NULL, '
            . "platform ENUM('web','android','ios') NOT NULL, "
            . 'name VARCHAR(100) NULL, '
            . 'push_token VARCHAR(512) NULL, '
            . 'last_seen_at DATETIME(3) NULL, '
            . 'last_sync_at DATETIME(3) NULL, '
            . 'revoked_at DATETIME(3) NULL, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . 'KEY idx_devices_user (user_id), '
            . 'KEY idx_devices_updated (updated_at), '
            . 'CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES users (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );
        $this->execute(
            'CREATE TABLE IF NOT EXISTS refresh_tokens ('
            . 'id BINARY(16) NOT NULL, '
            . 'device_id BINARY(16) NOT NULL, '
            . 'token_hash CHAR(64) NOT NULL, '
            . 'expires_at DATETIME(3) NOT NULL, '
            . 'revoked_at DATETIME(3) NULL, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_refresh_tokens_hash (token_hash), '
            . 'KEY idx_refresh_tokens_device (device_id), '
            . 'CONSTRAINT fk_refresh_tokens_device FOREIGN KEY (device_id) REFERENCES devices (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );
    }

    public function down(): void
    {
        foreach (['refresh_tokens', 'devices', 'user_roles', 'users'] as $table) {
            $this->execute('DROP TABLE IF EXISTS ' . $table);
        }
    }
}
