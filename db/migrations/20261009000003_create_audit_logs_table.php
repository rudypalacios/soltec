<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/** Slice 1.1: the audit trail. Rows are only ever added: no update, no delete, no soft delete. */
final class CreateAuditLogsTable extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS audit_logs ('
            . 'id BINARY(16) NOT NULL, '
            . 'occurred_at DATETIME(3) NOT NULL, '
            . 'user_id BINARY(16) NULL, '
            . 'device_id BINARY(16) NULL, '
            . 'action VARCHAR(50) NOT NULL, '
            . 'entity_type VARCHAR(50) NOT NULL, '
            . 'entity_id BINARY(16) NULL, '
            . 'before_data JSON NULL, '
            . 'after_data JSON NULL, '
            . 'ip_address VARBINARY(16) NULL, '
            . 'PRIMARY KEY (id), '
            . 'KEY idx_audit_entity (entity_type, entity_id, occurred_at), '
            . 'KEY idx_audit_user (user_id, occurred_at), '
            . 'KEY idx_audit_device (device_id), '
            . 'CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_audit_logs_device FOREIGN KEY (device_id) REFERENCES devices (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        );
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS audit_logs');
    }
}
