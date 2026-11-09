<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 3.3 (tasks with an activity thread): the catalog of task types (seeded with the nine of requirement AP1), the
 * tasks, and the thread that hangs from a record (type + id, so tickets reuse it in slice 3.5) with its mentions and
 * attached photos. Three permission resources, granted to `admin`: `task_types`, `tasks` (with a data scope) and
 * `thread_entries`.
 *
 * A task is reached by its owner, its assignee and whoever the data scope of `tasks` allows. The thread entry has the
 * sync columns because comments can be written offline later (Hito 8). Idempotent, and it uses no application class
 * because the deployment applies migrations before it uploads the new code.
 */
final class CreateTasksAndThread extends AbstractMigration
{
    private const TABLE_OPTIONS = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    private const TYPES = [
        'Ventas', 'Compras', 'Administrativa', 'Mantenimiento', 'Emergencia', 'Proyecto', 'Cobro', 'Pago', 'Servicios',
    ];

    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS task_types ('
            . 'id BINARY(16) NOT NULL, '
            . 'name VARCHAR(100) NOT NULL, '
            . 'active_name VARCHAR(100) GENERATED ALWAYS AS (IF(deleted_at IS NULL, name, NULL)) STORED, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_task_types_active_name (active_name), '
            . 'KEY idx_task_types_updated (updated_at)'
            . ')' . self::TABLE_OPTIONS,
        );
        foreach (self::TYPES as $name) {
            $this->execute(sprintf(
                "INSERT INTO task_types (id, name, created_at, updated_at) SELECT UNHEX('%s'), '%s', "
                . "UTC_TIMESTAMP(3), UTC_TIMESTAMP(3) FROM DUAL WHERE NOT EXISTS "
                . "(SELECT 1 FROM task_types WHERE name = '%s')",
                $this->newUuidV7Hex(),
                $name,
                $name,
            ));
        }

        $this->execute(
            'CREATE TABLE IF NOT EXISTS tasks ('
            . 'id BINARY(16) NOT NULL, '
            . 'title VARCHAR(150) NOT NULL, '
            . 'description TEXT NULL, '
            . 'task_type_id BINARY(16) NOT NULL, '
            . 'owner_id BINARY(16) NOT NULL, '
            . 'assignee_id BINARY(16) NOT NULL, '
            . 'due_date DATE NOT NULL, '
            . 'state_id BINARY(16) NOT NULL, '
            . 'proposed_due_date DATE NULL, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . 'KEY idx_tasks_owner (owner_id), '
            . 'KEY idx_tasks_assignee (assignee_id), '
            . 'KEY idx_tasks_state (state_id), '
            . 'KEY idx_tasks_type (task_type_id), '
            . 'KEY idx_tasks_due (due_date), '
            . 'KEY idx_tasks_updated (updated_at), '
            . 'CONSTRAINT fk_tasks_type FOREIGN KEY (task_type_id) REFERENCES task_types (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_tasks_owner FOREIGN KEY (owner_id) REFERENCES users (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES users (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_tasks_state FOREIGN KEY (state_id) REFERENCES workflow_states (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );

        // `subject_type`/`subject_id` point at the record the thread belongs to; there is no foreign key because the
        // subject can be a task today and a ticket tomorrow. `kind` is `comment` (a person wrote it) or `event` (the
        // system wrote it: `event_type` and `event_data` say what happened).
        $this->execute(
            'CREATE TABLE IF NOT EXISTS thread_entries ('
            . 'id BINARY(16) NOT NULL, '
            . 'subject_type VARCHAR(30) NOT NULL, '
            . 'subject_id BINARY(16) NOT NULL, '
            . 'kind VARCHAR(10) NOT NULL, '
            . 'author_id BINARY(16) NOT NULL, '
            . 'body TEXT NULL, '
            . 'event_type VARCHAR(40) NULL, '
            . 'event_data JSON NULL, '
            . "visibility VARCHAR(10) NOT NULL DEFAULT 'internal', "
            . 'edited_at DATETIME(3) NULL, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . 'KEY idx_thread_subject (subject_type, subject_id, created_at, id), '
            . 'KEY idx_thread_author (author_id), '
            . 'KEY idx_thread_updated (updated_at), '
            . 'CONSTRAINT fk_thread_author FOREIGN KEY (author_id) REFERENCES users (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );
        $this->execute(
            'CREATE TABLE IF NOT EXISTS thread_entry_mentions ('
            . 'entry_id BINARY(16) NOT NULL, '
            . 'user_id BINARY(16) NOT NULL, '
            . 'PRIMARY KEY (entry_id, user_id), '
            . 'KEY idx_thread_mentions_user (user_id), '
            . 'CONSTRAINT fk_thread_mentions_entry FOREIGN KEY (entry_id) REFERENCES thread_entries (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_thread_mentions_user FOREIGN KEY (user_id) REFERENCES users (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );
        $this->execute(
            'CREATE TABLE IF NOT EXISTS thread_entry_files ('
            . 'entry_id BINARY(16) NOT NULL, '
            . 'file_id BINARY(16) NOT NULL, '
            . 'sort_order INT UNSIGNED NOT NULL, '
            . 'PRIMARY KEY (entry_id, file_id), '
            . 'KEY idx_thread_files_file (file_id), '
            . 'CONSTRAINT fk_thread_files_entry FOREIGN KEY (entry_id) REFERENCES thread_entries (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_thread_files_file FOREIGN KEY (file_id) REFERENCES files (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );

        $resources = ['task_types' => 'Tipos de tarea', 'tasks' => 'Tareas', 'thread_entries' => 'Comentarios'];
        foreach ($resources as $code => $name) {
            $this->execute(sprintf("INSERT IGNORE INTO resources (code, name) VALUES ('%s', '%s')", $code, $name));
            $this->execute(
                'INSERT IGNORE INTO role_permissions (role_id, resource_code, permission_code) '
                . sprintf("SELECT r.id, '%s', p.code FROM roles r CROSS JOIN permissions p ", $code)
                . "WHERE r.code = 'admin' AND p.code IN ('view', 'create', 'edit', 'deactivate')",
            );
        }
        $this->execute("UPDATE resources SET scoped = 1 WHERE code = 'tasks'");
        $this->execute(
            'INSERT IGNORE INTO role_scopes (role_id, resource_code, scope) '
            . "SELECT r.id, 'tasks', 'all' FROM roles r WHERE r.code = 'admin'",
        );
    }

    public function down(): void
    {
        foreach (['task_types', 'tasks', 'thread_entries'] as $code) {
            $this->execute(sprintf("DELETE FROM role_scopes WHERE resource_code = '%s'", $code));
            $this->execute(sprintf("DELETE FROM role_permissions WHERE resource_code = '%s'", $code));
            $this->execute(sprintf("DELETE FROM resources WHERE code = '%s'", $code));
        }
        foreach (['thread_entry_files', 'thread_entry_mentions', 'thread_entries', 'tasks', 'task_types'] as $table) {
            $this->execute(sprintf('DROP TABLE IF EXISTS %s', $table));
        }
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
