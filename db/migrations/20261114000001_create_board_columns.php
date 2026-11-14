<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 3.3d (board columns, ADR-0030): the columns of the task board, and the column every state belongs to.
 *
 * A column groups one or more states of a flow; every state, active or not, belongs to exactly one. The existing
 * states each get a column of their own with their name and place, so the board looks like the flow until someone
 * merges columns. The column takes the id of its state: ids are unique per table and the migration needs no
 * application class (the deployment applies migrations before it uploads the new code).
 *
 * Names are not unique in the table: an inactive state may repeat the name of an active one, and the screen that
 * saves the set of columns validates them instead. Idempotent: each step checks what the previous run left.
 */
final class CreateBoardColumns extends AbstractMigration
{
    private const TABLE_OPTIONS = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS board_columns ('
            . 'id BINARY(16) NOT NULL, '
            . 'workflow_code VARCHAR(30) NOT NULL, '
            . 'name VARCHAR(100) NOT NULL, '
            . 'sort_order INT UNSIGNED NOT NULL, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . 'KEY idx_board_columns_order (workflow_code, sort_order), '
            . 'KEY idx_board_columns_updated (updated_at)'
            . ')' . self::TABLE_OPTIONS,
        );

        if (!$this->table('workflow_states')->hasColumn('board_column_id')) {
            $this->execute('ALTER TABLE workflow_states ADD COLUMN board_column_id BINARY(16) NULL');
        }
        $this->execute(
            'INSERT INTO board_columns (id, workflow_code, name, sort_order, created_at, updated_at) '
            . 'SELECT id, workflow_code, name, sort_order, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3) '
            . 'FROM workflow_states WHERE board_column_id IS NULL',
        );
        $this->execute('UPDATE workflow_states SET board_column_id = id WHERE board_column_id IS NULL');
        $this->execute('ALTER TABLE workflow_states MODIFY board_column_id BINARY(16) NOT NULL');

        if (!$this->foreignKeyExists('fk_workflow_states_board_column')) {
            $this->execute(
                'ALTER TABLE workflow_states ADD KEY idx_workflow_states_board_column (board_column_id), '
                . 'ADD CONSTRAINT fk_workflow_states_board_column FOREIGN KEY (board_column_id) '
                . 'REFERENCES board_columns (id) ON DELETE RESTRICT ON UPDATE RESTRICT',
            );
        }
    }

    public function down(): void
    {
        if ($this->foreignKeyExists('fk_workflow_states_board_column')) {
            $this->execute('ALTER TABLE workflow_states DROP FOREIGN KEY fk_workflow_states_board_column');
        }
        if ($this->table('workflow_states')->hasColumn('board_column_id')) {
            $this->execute('ALTER TABLE workflow_states DROP COLUMN board_column_id');
        }
        $this->execute('DROP TABLE IF EXISTS board_columns');
    }

    private function foreignKeyExists(string $name): bool
    {
        $row = $this->fetchRow(sprintf(
            'SELECT 1 AS found FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() '
            . "AND TABLE_NAME = 'workflow_states' AND CONSTRAINT_NAME = '%s' AND CONSTRAINT_TYPE = 'FOREIGN KEY'",
            $name,
        ));

        return is_array($row);
    }
}
