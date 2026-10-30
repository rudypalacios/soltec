<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 3.1 (state engine): the states of the `task` and `ticket` flows, the transitions between them, and the
 * `workflow_states` resource granted to `admin` (ADR-0012). A flow is a code in the application, not a row: a new
 * one arrives with the milestone that needs it, together with its seed.
 *
 * `initial_marker` is NULL unless the state is the active initial one, so its unique index allows one initial state
 * per flow at a time (the same trick as `margin_levels.default_marker`). Transitions are configuration links that
 * the screen replaces as a set, like `role_permissions`.
 *
 * Idempotent, and it uses no application class because the deployment applies migrations before it uploads the
 * new code.
 */
final class CreateWorkflowTables extends AbstractMigration
{
    private const TABLE_OPTIONS = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    /** name => [color, is_initial, is_terminal], in flow order. */
    private const STATES = [
        'task' => [
            'Asignada' => ['#0B6BB0', 1, 0],
            'Aceptada' => ['#00796B', 0, 0],
            'En ejecución' => ['#9A5800', 0, 0],
            'Completada' => ['#1E7A4C', 0, 0],
            'Cerrada' => ['#7C8996', 0, 1],
            'Rechazada' => ['#B3261E', 0, 0],
        ],
        'ticket' => [
            'Abierto' => ['#0B6BB0', 1, 0],
            'En atención' => ['#9A5800', 0, 0],
            'Resuelto' => ['#1E7A4C', 0, 0],
            'Cerrado' => ['#7C8996', 0, 1],
        ],
    ];

    /** Pairs of state names that may follow each other. */
    private const TRANSITIONS = [
        'task' => [
            ['Asignada', 'Aceptada'], ['Asignada', 'Rechazada'], ['Aceptada', 'En ejecución'],
            ['En ejecución', 'Completada'], ['Completada', 'Cerrada'], ['Completada', 'En ejecución'],
            ['Rechazada', 'Asignada'],
        ],
        'ticket' => [
            ['Abierto', 'En atención'], ['En atención', 'Resuelto'], ['Resuelto', 'Cerrado'],
            ['Resuelto', 'En atención'],
        ],
    ];

    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS workflow_states ('
            . 'id BINARY(16) NOT NULL, '
            . 'workflow_code VARCHAR(30) NOT NULL, '
            . 'name VARCHAR(100) NOT NULL, '
            . 'active_name VARCHAR(100) GENERATED ALWAYS AS (IF(deleted_at IS NULL, name, NULL)) STORED, '
            . 'color CHAR(7) NOT NULL, '
            . 'sort_order INT UNSIGNED NOT NULL, '
            . 'is_initial TINYINT(1) NOT NULL DEFAULT 0, '
            . 'is_terminal TINYINT(1) NOT NULL DEFAULT 0, '
            . 'initial_marker VARCHAR(30) GENERATED ALWAYS AS '
            . '(IF(is_initial = 1 AND deleted_at IS NULL, workflow_code, NULL)) STORED, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_workflow_states_active_name (workflow_code, active_name), '
            . 'UNIQUE KEY uq_workflow_states_initial (initial_marker), '
            . 'KEY idx_workflow_states_order (workflow_code, sort_order), '
            . 'KEY idx_workflow_states_updated (updated_at)'
            . ')' . self::TABLE_OPTIONS,
        );
        $this->execute(
            'CREATE TABLE IF NOT EXISTS workflow_transitions ('
            . 'from_state_id BINARY(16) NOT NULL, '
            . 'to_state_id BINARY(16) NOT NULL, '
            . 'PRIMARY KEY (from_state_id, to_state_id), '
            . 'KEY idx_workflow_transitions_to (to_state_id), '
            . 'CONSTRAINT fk_workflow_transitions_from FOREIGN KEY (from_state_id) '
            . 'REFERENCES workflow_states (id) ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_workflow_transitions_to FOREIGN KEY (to_state_id) '
            . 'REFERENCES workflow_states (id) ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );

        foreach (self::STATES as $code => $states) {
            $order = 0;
            foreach ($states as $name => [$color, $initial, $terminal]) {
                ++$order;
                $this->execute(sprintf(
                    "INSERT INTO workflow_states (id, workflow_code, name, color, sort_order, is_initial, is_terminal, "
                    . "created_at, updated_at) SELECT UNHEX('%s'), '%s', '%s', '%s', %d, %d, %d, "
                    . "UTC_TIMESTAMP(3), UTC_TIMESTAMP(3) FROM DUAL WHERE NOT EXISTS "
                    . "(SELECT 1 FROM workflow_states WHERE workflow_code = '%s' AND name = '%s')",
                    $this->newUuidV7Hex(),
                    $code,
                    $name,
                    $color,
                    $order,
                    $initial,
                    $terminal,
                    $code,
                    $name,
                ));
            }
        }
        foreach (self::TRANSITIONS as $code => $pairs) {
            foreach ($pairs as [$from, $to]) {
                $this->execute(sprintf(
                    'INSERT IGNORE INTO workflow_transitions (from_state_id, to_state_id) '
                    . 'SELECT f.id, t.id FROM workflow_states f '
                    . 'JOIN workflow_states t ON t.workflow_code = f.workflow_code '
                    . "WHERE f.workflow_code = '%s' AND f.name = '%s' AND t.name = '%s'",
                    $code,
                    $from,
                    $to,
                ));
            }
        }

        $this->execute("INSERT IGNORE INTO resources (code, name) VALUES ('workflow_states', 'Flujos de estado')");
        $this->execute(
            'INSERT IGNORE INTO role_permissions (role_id, resource_code, permission_code) '
            . "SELECT r.id, 'workflow_states', p.code FROM roles r CROSS JOIN permissions p "
            . "WHERE r.code = 'admin' AND p.code IN ('view', 'create', 'edit', 'deactivate')",
        );
    }

    public function down(): void
    {
        $this->execute("DELETE FROM role_permissions WHERE resource_code = 'workflow_states'");
        $this->execute("DELETE FROM resources WHERE code = 'workflow_states'");
        $this->execute('DROP TABLE IF EXISTS workflow_transitions');
        $this->execute('DROP TABLE IF EXISTS workflow_states');
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
