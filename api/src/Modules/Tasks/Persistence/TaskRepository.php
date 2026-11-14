<?php

declare(strict_types=1);

namespace Soltec\Modules\Tasks\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Query\QueryBuilder;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Auth\DataScope;
use Soltec\Kernel\Auth\ScopedQuery;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Tasks\Domain\TaskData;
use Soltec\Modules\Tasks\Domain\TaskRecord;

/**
 * Reads and writes `tasks`. A task is reached by its owner, its assignee and whoever the data scope of `tasks` allows
 * (the scope looks at both people); one outside that does not exist for the reader. Ids cross the database as hex.
 */
final class TaskRepository
{
    public const RESOURCE = 'tasks';

    /** The reader has been mentioned in an active comment of the task. */
    private const MENTIONED = 'EXISTS (SELECT 1 FROM thread_entry_mentions tm '
        . 'JOIN thread_entries te ON te.id = tm.entry_id '
        . "WHERE te.subject_type = 'task' AND te.subject_id = t.id AND te.deleted_at IS NULL "
        . 'AND tm.user_id = UNHEX(:mentioned_user))';

    private const COLUMNS = 'LOWER(HEX(t.id)) AS id, t.title, t.description, '
        . 'LOWER(HEX(t.task_type_id)) AS task_type_id, ty.name AS task_type_name, '
        . 'LOWER(HEX(t.owner_id)) AS owner_id, ow.name AS owner_name, '
        . 'LOWER(HEX(t.assignee_id)) AS assignee_id, asg.name AS assignee_name, t.due_date, '
        . 'LOWER(HEX(t.state_id)) AS state_id, st.name AS state_name, st.color AS state_color, '
        . 'st.is_terminal AS state_is_terminal, t.proposed_due_date, t.created_at, t.updated_at, t.version, '
        . 't.deleted_at';

    public function __construct(private readonly Connection $connection)
    {
    }

    public function find(string $id, CurrentUser $reader): ?TaskRecord
    {
        $row = $this->base($reader, self::COLUMNS)
            ->andWhere('t.id = UNHEX(:id)')
            ->setParameter('id', Uuid::toHex($id))
            ->executeQuery()
            ->fetchAssociative();

        return $row === false ? null : $this->hydrate($row);
    }

    /** Locks the row until the end of the transaction. */
    public function lock(string $id): bool
    {
        return $this->connection->fetchOne(
            'SELECT 1 FROM tasks WHERE id = UNHEX(:id) FOR UPDATE',
            ['id' => Uuid::toHex($id)],
        ) !== false;
    }

    /**
     * @param string $status active, inactive or all
     * @param string $relation any, owned (I asked for it) or assigned (it is mine to do)
     * @return array{records: list<TaskRecord>, total: int}
     */
    public function search(
        CurrentUser $reader,
        ?string $text,
        string $status,
        string $relation,
        ?string $stateId,
        ?string $taskTypeId,
        ?string $assigneeId,
        ?string $dueBefore,
        bool $openOnly,
        Pagination $page,
    ): array {
        $filtered = function (QueryBuilder $query) use (
            $reader,
            $text,
            $status,
            $relation,
            $stateId,
            $taskTypeId,
            $assigneeId,
            $dueBefore,
            $openOnly,
        ): QueryBuilder {
            $this->applyFilters($query, $reader, $text, $status, $relation);
            $byId = ['state_id' => $stateId, 'task_type_id' => $taskTypeId, 'assignee_id' => $assigneeId];
            foreach ($byId as $column => $value) {
                if ($value !== null) {
                    $query->andWhere(sprintf('t.%s = UNHEX(:%s)', $column, $column))
                        ->setParameter($column, Uuid::toHex($value));
                }
            }
            if ($dueBefore !== null) {
                $query->andWhere('t.due_date < :due_before')->setParameter('due_before', $dueBefore);
            }
            if ($openOnly) {
                $query->andWhere('st.is_terminal = 0');
            }

            return $query;
        };

        $total = $filtered($this->base($reader, 'COUNT(*)'))->executeQuery()->fetchOne();
        $rows = $filtered($this->base($reader, self::COLUMNS))
            ->orderBy('t.due_date')
            ->addOrderBy('t.created_at', 'DESC')
            ->addOrderBy('t.id')
            ->setFirstResult($page->offset())
            ->setMaxResults($page->perPage)
            ->executeQuery()
            ->fetchAllAssociative();

        return [
            'records' => array_map($this->hydrate(...), $rows),
            'total' => is_numeric($total) ? (int) $total : 0,
        ];
    }

    /**
     * How many tasks the reader reaches in each state, with the filters of the board.
     *
     * @param string $status active, inactive or all
     * @param string $relation any, owned or assigned
     * @return array<string, int> counts by state id; a state without tasks is absent
     */
    public function countByState(CurrentUser $reader, ?string $text, string $status, string $relation): array
    {
        $query = $this->base($reader, 'LOWER(HEX(t.state_id)) AS state_id, COUNT(*) AS total');
        $rows = $this->applyFilters($query, $reader, $text, $status, $relation)
            ->groupBy('t.state_id')
            ->executeQuery()
            ->fetchAllAssociative();

        $counts = [];
        foreach ($rows as $row) {
            $counts[Uuid::fromHex(Row::string($row, 'state_id'))] = Row::int($row, 'total');
        }

        return $counts;
    }

    /**
     * A page of the tasks in any of the states, with the filters of the board: the closed ones by their latest change
     * (the newest first), the open ones by due date.
     *
     * @param list<string> $stateIds
     * @return list<TaskRecord>
     */
    public function inStates(
        CurrentUser $reader,
        ?string $text,
        string $status,
        string $relation,
        array $stateIds,
        bool $newestFirst,
        Pagination $page,
    ): array {
        $query = $this->applyFilters($this->base($reader, self::COLUMNS), $reader, $text, $status, $relation);
        $marks = [];
        foreach ($stateIds as $position => $stateId) {
            $marks[] = 'UNHEX(:board_state_' . $position . ')';
            $query->setParameter('board_state_' . $position, Uuid::toHex($stateId));
        }
        $query->andWhere('t.state_id IN (' . implode(', ', $marks) . ')');
        if ($newestFirst) {
            $query->orderBy('t.updated_at', 'DESC');
        } else {
            $query->orderBy('t.due_date')->addOrderBy('t.created_at', 'DESC');
        }
        $rows = $query->addOrderBy('t.id')
            ->setFirstResult($page->offset())
            ->setMaxResults($page->perPage)
            ->executeQuery()
            ->fetchAllAssociative();

        return array_map($this->hydrate(...), $rows);
    }

    public function insert(
        string $id,
        TaskData $data,
        string $ownerId,
        string $stateId,
        DateTimeImmutable $now,
    ): void {
        $this->connection->executeStatement(
            'INSERT INTO tasks (id, title, description, task_type_id, owner_id, assignee_id, due_date, state_id, '
            . 'created_at, updated_at) VALUES (UNHEX(:id), :title, :description, UNHEX(:task_type_id), '
            . 'UNHEX(:owner), UNHEX(:assignee_id), :due_date, UNHEX(:state), :now, :now)',
            [
                'id' => Uuid::toHex($id),
                'owner' => Uuid::toHex($ownerId),
                'state' => Uuid::toHex($stateId),
                'now' => Timestamps::toDb($now),
            ] + $this->hexed($data),
        );
    }

    /** @return bool false when the version is stale */
    public function update(string $id, int $version, TaskData $data, DateTimeImmutable $now): bool
    {
        return $this->connection->executeStatement(
            'UPDATE tasks SET title = :title, description = :description, task_type_id = UNHEX(:task_type_id), '
            . 'assignee_id = UNHEX(:assignee_id), due_date = :due_date, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id) AND version = :version',
            [
                'id' => Uuid::toHex($id),
                'version' => $version,
                'now' => Timestamps::toDb($now),
            ] + $this->hexed($data),
        ) === 1;
    }

    /**
     * Moves the task to a state, records the date the assignee proposes (or clears it) and, when the owner accepted
     * that date, makes it the due date.
     *
     * @return bool false when the version is stale
     */
    public function moveTo(
        string $id,
        int $version,
        string $stateId,
        ?string $proposedDueDate,
        ?string $newDueDate,
        DateTimeImmutable $now,
    ): bool {
        return $this->connection->executeStatement(
            'UPDATE tasks SET state_id = UNHEX(:state), proposed_due_date = :proposed, '
            . 'due_date = COALESCE(:due_date, due_date), updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id) AND version = :version',
            [
                'id' => Uuid::toHex($id),
                'version' => $version,
                'state' => Uuid::toHex($stateId),
                'proposed' => $proposedDueDate,
                'due_date' => $newDueDate,
                'now' => Timestamps::toDb($now),
            ],
        ) === 1;
    }

    /** Deactivates (a date) or reactivates (null). */
    public function setDeletedAt(string $id, ?DateTimeImmutable $deletedAt, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE tasks SET deleted_at = :deleted_at, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id)',
            [
                'id' => Uuid::toHex($id),
                'deleted_at' => $deletedAt === null ? null : Timestamps::toDb($deletedAt),
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /** Whether the task type exists and is active. Takes a shared lock so it stays so until the transaction ends. */
    public function taskTypeIsActive(string $id): bool
    {
        return $this->connection->fetchOne(
            'SELECT 1 FROM task_types WHERE id = UNHEX(:id) AND deleted_at IS NULL LOCK IN SHARE MODE',
            ['id' => Uuid::toHex($id)],
        ) !== false;
    }

    /** @return array<string, string|null> the task data as the statements bind it */
    private function hexed(TaskData $data): array
    {
        $values = $data->toArray();
        $values['task_type_id'] = Uuid::toHex($data->taskTypeId);
        $values['assignee_id'] = Uuid::toHex($data->assigneeId);

        return $values;
    }

    /** The filters the list and the board share: status, relation to the reader and a title search. */
    private function applyFilters(
        QueryBuilder $query,
        CurrentUser $reader,
        ?string $text,
        string $status,
        string $relation,
    ): QueryBuilder {
        if ($status === 'active') {
            $query->andWhere('t.deleted_at IS NULL');
        } elseif ($status === 'inactive') {
            $query->andWhere('t.deleted_at IS NOT NULL');
        }
        if ($relation === 'owned') {
            $query->andWhere('t.owner_id = UNHEX(:me)')->setParameter('me', Uuid::toHex($reader->id));
        } elseif ($relation === 'assigned') {
            $query->andWhere('t.assignee_id = UNHEX(:me)')->setParameter('me', Uuid::toHex($reader->id));
        }
        if ($text !== null && $text !== '') {
            $query->andWhere('t.title LIKE :text')
                ->setParameter('text', '%' . addcslashes($text, '%_\\') . '%');
        }

        return $query;
    }

    /** `FROM tasks t` with its joins and the reader's data scope applied. */
    private function base(CurrentUser $reader, string $select): QueryBuilder
    {
        $query = $this->connection->createQueryBuilder()
            ->select($select)
            ->from('tasks', 't')
            ->innerJoin('t', 'task_types', 'ty', 'ty.id = t.task_type_id')
            ->innerJoin('t', 'users', 'ow', 'ow.id = t.owner_id')
            ->innerJoin('t', 'users', 'asg', 'asg.id = t.assignee_id')
            ->innerJoin('t', 'workflow_states', 'st', 'st.id = t.state_id');
        // Whoever asked for the task, was asked to do it or was mentioned in it reaches it, with or without the
        // permission to see tasks; that permission, with its data scope, only widens what they reach (ADR-0029).
        $scope = $reader->can(self::RESOURCE, 'view') ? $reader->scopeFor(self::RESOURCE) : DataScope::Own;
        $query->setParameter('mentioned_user', Uuid::toHex($reader->id));
        ScopedQuery::restrictAny($query, $reader, $scope, ['t.owner_id', 't.assignee_id'], self::MENTIONED);

        return $query;
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): TaskRecord
    {
        return new TaskRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            new TaskData(
                Row::string($row, 'title'),
                Row::nullableString($row, 'description'),
                Uuid::fromHex(Row::string($row, 'task_type_id')),
                Uuid::fromHex(Row::string($row, 'assignee_id')),
                Row::string($row, 'due_date'),
            ),
            Row::string($row, 'task_type_name'),
            Uuid::fromHex(Row::string($row, 'owner_id')),
            Row::string($row, 'owner_name'),
            Row::string($row, 'assignee_name'),
            Uuid::fromHex(Row::string($row, 'state_id')),
            Row::string($row, 'state_name'),
            Row::string($row, 'state_color'),
            Row::bool($row, 'state_is_terminal'),
            Row::nullableString($row, 'proposed_due_date'),
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
            Row::nullableDate($row, 'deleted_at'),
        );
    }
}
