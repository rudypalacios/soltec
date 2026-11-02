<?php

declare(strict_types=1);

namespace Soltec\Modules\Workflow\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Workflow\Domain\WorkflowCode;
use Soltec\Modules\Workflow\Domain\WorkflowStateRecord;

/** Reads and writes `workflow_states` and `workflow_transitions`. Ids cross the database as hex (see Uuid). */
final class WorkflowRepository
{
    private const COLUMNS = 'LOWER(HEX(s.id)) AS id, s.workflow_code, s.name, s.color, s.sort_order, s.is_initial, '
        . 's.is_terminal, s.created_at, s.updated_at, s.version, s.deleted_at';

    public function __construct(private readonly Connection $connection)
    {
    }

    /**
     * Serializes the edits of one flow until the end of the transaction, so two administrators cannot both leave
     * it without a terminal state or reorder it at the same time.
     */
    public function lockFlow(WorkflowCode $code): void
    {
        $this->connection->fetchFirstColumn(
            'SELECT id FROM workflow_states WHERE workflow_code = :code FOR UPDATE',
            ['code' => $code->value],
        );
    }

    public function find(WorkflowCode $code, string $id): ?WorkflowStateRecord
    {
        $row = $this->connection->fetchAssociative(
            'SELECT ' . self::COLUMNS . ' FROM workflow_states s WHERE s.workflow_code = :code AND s.id = UNHEX(:id)',
            ['code' => $code->value, 'id' => Uuid::toHex($id)],
        );
        if ($row === false) {
            return null;
        }

        return $this->hydrate($row, $this->transitionsOf($code));
    }

    /**
     * @param string $status active, inactive or all
     * @return list<WorkflowStateRecord> in the order of the flow
     */
    public function list(WorkflowCode $code, string $status): array
    {
        $where = match ($status) {
            'active' => ' AND s.deleted_at IS NULL',
            'inactive' => ' AND s.deleted_at IS NOT NULL',
            default => '',
        };
        $rows = $this->connection->fetchAllAssociative(
            'SELECT ' . self::COLUMNS . ' FROM workflow_states s WHERE s.workflow_code = :code' . $where
            . ' ORDER BY s.sort_order, s.name, s.id',
            ['code' => $code->value],
        );
        $transitions = $this->transitionsOf($code);

        return array_map(fn (array $row): WorkflowStateRecord => $this->hydrate($row, $transitions), $rows);
    }

    /** @return list<string> ids of the active states of the flow, in order */
    public function activeIds(WorkflowCode $code): array
    {
        $ids = $this->connection->fetchFirstColumn(
            'SELECT LOWER(HEX(id)) FROM workflow_states WHERE workflow_code = :code AND deleted_at IS NULL '
            . 'ORDER BY sort_order, name, id',
            ['code' => $code->value],
        );

        return array_map(static fn (mixed $id): string => Uuid::fromHex(Row::scalarString($id)), $ids);
    }

    public function activeTerminalCount(WorkflowCode $code): int
    {
        $count = $this->connection->fetchOne(
            'SELECT COUNT(*) FROM workflow_states WHERE workflow_code = :code AND deleted_at IS NULL '
            . 'AND is_terminal = 1',
            ['code' => $code->value],
        );

        return is_numeric($count) ? (int) $count : 0;
    }

    public function nextSortOrder(WorkflowCode $code): int
    {
        $max = $this->connection->fetchOne(
            'SELECT MAX(sort_order) FROM workflow_states WHERE workflow_code = :code',
            ['code' => $code->value],
        );

        return (is_numeric($max) ? (int) $max : 0) + 1;
    }

    public function insert(
        string $id,
        WorkflowCode $code,
        string $name,
        string $color,
        int $sortOrder,
        bool $isTerminal,
        DateTimeImmutable $now,
    ): void {
        $this->connection->executeStatement(
            'INSERT INTO workflow_states (id, workflow_code, name, color, sort_order, is_terminal, created_at, '
            . 'updated_at) VALUES (UNHEX(:id), :code, :name, :color, :sort_order, :terminal, :now, :now)',
            [
                'id' => Uuid::toHex($id),
                'code' => $code->value,
                'name' => $name,
                'color' => $color,
                'sort_order' => $sortOrder,
                'terminal' => (int) $isTerminal,
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /** @return bool false when the version is stale or the state does not exist */
    public function update(
        string $id,
        int $version,
        string $name,
        string $color,
        bool $isInitial,
        bool $isTerminal,
        DateTimeImmutable $now,
    ): bool {
        return $this->connection->executeStatement(
            'UPDATE workflow_states SET name = :name, color = :color, is_initial = :initial, is_terminal = :terminal, '
            . 'updated_at = :now, version = version + 1 WHERE id = UNHEX(:id) AND version = :version',
            [
                'id' => Uuid::toHex($id),
                'version' => $version,
                'name' => $name,
                'color' => $color,
                'initial' => (int) $isInitial,
                'terminal' => (int) $isTerminal,
                'now' => Timestamps::toDb($now),
            ],
        ) === 1;
    }

    /** Takes the initial flag away from the flow's initial state, before another one gets it. */
    public function clearInitial(WorkflowCode $code, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE workflow_states SET is_initial = 0, updated_at = :now, version = version + 1 '
            . 'WHERE workflow_code = :code AND is_initial = 1',
            ['code' => $code->value, 'now' => Timestamps::toDb($now)],
        );
    }

    /** Deactivates (a date) or reactivates (null). */
    public function setDeletedAt(string $id, ?DateTimeImmutable $deletedAt, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE workflow_states SET deleted_at = :deleted_at, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id)',
            [
                'id' => Uuid::toHex($id),
                'deleted_at' => $deletedAt === null ? null : Timestamps::toDb($deletedAt),
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    public function setSortOrder(string $id, int $sortOrder, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE workflow_states SET sort_order = :sort_order, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id) AND sort_order <> :sort_order',
            ['id' => Uuid::toHex($id), 'sort_order' => $sortOrder, 'now' => Timestamps::toDb($now)],
        );
    }

    /**
     * Replaces the transitions among the flow's active states. Links that touch an inactive state are left alone,
     * so reactivating the state brings its transitions back.
     *
     * @param list<array{string, string}> $pairs from and to state ids
     */
    public function replaceTransitions(WorkflowCode $code, array $pairs): void
    {
        $this->connection->executeStatement(
            'DELETE tr FROM workflow_transitions tr '
            . 'JOIN workflow_states f ON f.id = tr.from_state_id AND f.workflow_code = :code AND f.deleted_at IS NULL '
            . 'JOIN workflow_states t ON t.id = tr.to_state_id AND t.deleted_at IS NULL',
            ['code' => $code->value],
        );
        foreach ($pairs as [$from, $to]) {
            $this->connection->executeStatement(
                'INSERT INTO workflow_transitions (from_state_id, to_state_id) VALUES (UNHEX(:from), UNHEX(:to))',
                ['from' => Uuid::toHex($from), 'to' => Uuid::toHex($to)],
            );
        }
    }

    /** The id of the flow's active initial state, or null when it has none. */
    public function initialStateId(WorkflowCode $code): ?string
    {
        $hex = $this->connection->fetchOne(
            'SELECT LOWER(HEX(id)) FROM workflow_states WHERE workflow_code = :code AND is_initial = 1 '
            . 'AND deleted_at IS NULL',
            ['code' => $code->value],
        );

        return is_string($hex) ? Uuid::fromHex($hex) : null;
    }

    /** Whether a record may move between two states: both active, in this flow, and linked. */
    public function transitionAllowed(WorkflowCode $code, string $from, string $to): bool
    {
        return $this->connection->fetchOne(
            'SELECT 1 FROM workflow_transitions tr '
            . 'JOIN workflow_states f ON f.id = tr.from_state_id AND f.workflow_code = :code AND f.deleted_at IS NULL '
            . 'JOIN workflow_states t ON t.id = tr.to_state_id AND t.workflow_code = :code AND t.deleted_at IS NULL '
            . 'WHERE tr.from_state_id = UNHEX(:from) AND tr.to_state_id = UNHEX(:to)',
            ['code' => $code->value, 'from' => Uuid::toHex($from), 'to' => Uuid::toHex($to)],
        ) !== false;
    }

    /** @return array<string, list<string>> active destinations by origin id, in the order of the flow */
    private function transitionsOf(WorkflowCode $code): array
    {
        $rows = $this->connection->fetchAllAssociative(
            'SELECT LOWER(HEX(tr.from_state_id)) AS from_id, LOWER(HEX(tr.to_state_id)) AS to_id '
            . 'FROM workflow_transitions tr '
            . 'JOIN workflow_states t ON t.id = tr.to_state_id AND t.workflow_code = :code AND t.deleted_at IS NULL '
            . 'ORDER BY t.sort_order, t.name, t.id',
            ['code' => $code->value],
        );
        $byOrigin = [];
        foreach ($rows as $row) {
            $byOrigin[Uuid::fromHex(Row::string($row, 'from_id'))][] = Uuid::fromHex(Row::string($row, 'to_id'));
        }

        return $byOrigin;
    }

    /**
     * @param array<string, mixed> $row
     * @param array<string, list<string>> $transitions
     */
    private function hydrate(array $row, array $transitions): WorkflowStateRecord
    {
        $id = Uuid::fromHex(Row::string($row, 'id'));

        return new WorkflowStateRecord(
            $id,
            WorkflowCode::from(Row::string($row, 'workflow_code')),
            Row::string($row, 'name'),
            Row::string($row, 'color'),
            Row::int($row, 'sort_order'),
            Row::bool($row, 'is_initial'),
            Row::bool($row, 'is_terminal'),
            $transitions[$id] ?? [],
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
            Row::nullableDate($row, 'deleted_at'),
        );
    }
}
