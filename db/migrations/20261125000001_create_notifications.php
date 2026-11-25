<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 3.4a (notifications, ADR-0031): what people are told in the application and by email, and the single row of
 * settings the reminders need.
 *
 * `notifications` has one row per person told and per event. `entry_id` links a notice to the comment it comes from, so
 * deactivating the comment can withdraw it. `dedupe_key` is unique and lets the scheduled reminders run every hour
 * without telling the same person twice. `email_status` (pending, sending, sent, failed) makes a failed email visible
 * instead of silent. `notification_settings` is a singleton (the hour of the due-date reminders, and when the
 * scheduled command last ran). One permission resource, `notification_settings`, granted to `admin`.
 *
 * Idempotent, and it uses no application class because the deployment applies migrations before it uploads the new
 * code.
 */
final class CreateNotifications extends AbstractMigration
{
    private const TABLE_OPTIONS = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS notifications ('
            . 'id BINARY(16) NOT NULL, '
            . 'user_id BINARY(16) NOT NULL, '
            . 'type VARCHAR(40) NOT NULL, '
            . 'subject_type VARCHAR(30) NOT NULL, '
            . 'subject_id BINARY(16) NOT NULL, '
            . 'entry_id BINARY(16) NULL, '
            . 'actor_id BINARY(16) NULL, '
            . 'data JSON NOT NULL, '
            . 'dedupe_key VARCHAR(120) NULL, '
            . 'read_at DATETIME(3) NULL, '
            . "email_status VARCHAR(10) NOT NULL DEFAULT 'pending', "
            . 'email_error VARCHAR(255) NULL, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_notifications_dedupe (dedupe_key), '
            . 'KEY idx_notifications_user (user_id, deleted_at, id), '
            . 'KEY idx_notifications_unread (user_id, deleted_at, read_at), '
            . 'KEY idx_notifications_entry (entry_id), '
            . 'KEY idx_notifications_email (email_status), '
            . 'KEY idx_notifications_updated (updated_at), '
            . 'CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id), '
            . 'CONSTRAINT fk_notifications_actor FOREIGN KEY (actor_id) REFERENCES users (id)'
            . ')' . self::TABLE_OPTIONS,
        );

        $this->execute(
            'CREATE TABLE IF NOT EXISTS notification_settings ('
            . 'id BINARY(16) NOT NULL, '
            . "singleton ENUM('1') NOT NULL DEFAULT '1', "
            . 'due_reminder_hour TINYINT UNSIGNED NOT NULL DEFAULT 8, '
            . 'last_run_at DATETIME(3) NULL, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_notification_settings_singleton (singleton)'
            . ')' . self::TABLE_OPTIONS,
        );
        $this->execute(sprintf(
            "INSERT INTO notification_settings (id, created_at, updated_at) SELECT UNHEX('%s'), UTC_TIMESTAMP(3), "
            . 'UTC_TIMESTAMP(3) FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM notification_settings)',
            $this->newUuidV7Hex(),
        ));

        $this->execute("INSERT IGNORE INTO resources (code, name) VALUES ('notification_settings', 'Notificaciones')");
        $this->execute(
            'INSERT IGNORE INTO role_permissions (role_id, resource_code, permission_code) '
            . 'SELECT r.id, res.code, p.code FROM roles r CROSS JOIN resources res CROSS JOIN permissions p '
            . "WHERE r.code = 'admin' AND res.code = 'notification_settings' AND p.code IN ('view', 'edit')",
        );
    }

    public function down(): void
    {
        $this->execute("DELETE FROM role_permissions WHERE resource_code = 'notification_settings'");
        $this->execute("DELETE FROM resources WHERE code = 'notification_settings'");
        $this->execute('DROP TABLE IF EXISTS notification_settings');
        $this->execute('DROP TABLE IF EXISTS notifications');
    }

    private function newUuidV7Hex(): string
    {
        $bytes = substr(pack('J', (int) floor(microtime(true) * 1000)), 2) . random_bytes(10);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x70);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);

        return bin2hex($bytes);
    }
}
