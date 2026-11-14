<?php

declare(strict_types=1);

namespace Soltec\Modules\Workflow\Application;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Workflow\Domain\BoardColumnRecord;
use Soltec\Modules\Workflow\Domain\WorkflowCode;
use Soltec\Modules\Workflow\Persistence\WorkflowRepository;

/**
 * The columns of the board of a flow (ADR-0030). Every state belongs to one column; the board draws one column per
 * group of states. The administrator replaces the whole arrangement at once, so a half-edited board never exists.
 * Like the other writes of a flow, it takes the flow's lock first.
 */
final class BoardColumnService
{
    private const ENTITY = 'board_columns';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly WorkflowRepository $workflows,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return list<BoardColumnRecord> the active columns, in order */
    public function list(WorkflowCode $code): array
    {
        return $this->workflows->boardColumns($code);
    }

    /**
     * Replaces the arrangement: the columns in the order given, each with the active states it groups. A column with
     * an `id` is kept (renamed, moved); one without it is created. An active column that is not named is closed when
     * it has no state left, and stays (after the others) when it still holds inactive states, so reactivating one of
     * them finds its column. Inactive states stay in the column they have.
     *
     * @param list<array{id: string|null, name: string, state_ids: list<string>}> $columns
     * @return list<BoardColumnRecord> the arrangement after the change
     * @throws ValidationException `columns` `invalid` (a column without states, a repeated name, an unknown or
     *     repeated column) or `state_ids` `invalid` (the states are not exactly the active ones of the flow)
     */
    public function replace(ActorContext $actor, WorkflowCode $code, array $columns): array
    {
        $this->connection->transactional(function () use ($actor, $code, $columns): void {
            $this->workflows->lockFlow($code);
            $before = $this->workflows->boardColumns($code);
            $this->assertArrangement($code, $columns, $before);

            $now = $this->clock->now();
            $kept = [];
            foreach ($columns as $position => $column) {
                $id = $column['id'] ?? Uuid::v7();
                if ($column['id'] === null) {
                    $this->workflows->insertColumn($id, $code, $column['name'], $position + 1, $now);
                } else {
                    $this->workflows->updateColumn($id, $column['name'], $position + 1, $now);
                }
                foreach ($column['state_ids'] as $stateId) {
                    $this->workflows->setStateColumn($stateId, $id, $now);
                }
                $kept[$id] = true;
            }

            // The columns left out go to the end if inactive states still sit in them, or are closed when empty.
            $next = count($columns);
            foreach ($before as $old) {
                if (isset($kept[$old->id])) {
                    continue;
                }
                $stillHolds = array_diff($old->allStateIds, $this->movedOut($columns));
                if ($stillHolds === []) {
                    $this->workflows->deactivateColumn($old->id, $now);
                } else {
                    $this->workflows->updateColumn($old->id, $old->name, ++$next, $now);
                }
            }

            $after = $this->workflows->boardColumns($code);
            $beforeText = $this->describe($before, $this->stateNames($code));
            $afterText = $this->describe($after, $this->stateNames($code));
            if ($beforeText !== $afterText) {
                $this->audit->record(
                    $actor,
                    'update',
                    self::ENTITY,
                    null,
                    ['workflow' => $code->value, 'columns' => $beforeText],
                    ['workflow' => $code->value, 'columns' => $afterText],
                );
            }
        });

        return $this->workflows->boardColumns($code);
    }

    /**
     * @param list<array{id: string|null, name: string, state_ids: list<string>}> $columns
     * @param list<BoardColumnRecord> $current
     */
    private function assertArrangement(WorkflowCode $code, array $columns, array $current): void
    {
        $known = array_map(static fn (BoardColumnRecord $column): string => $column->id, $current);
        $names = [];
        $ids = [];
        $stateIds = [];
        foreach ($columns as $column) {
            $key = mb_strtolower($column['name']);
            if ($column['state_ids'] === [] || isset($names[$key])) {
                throw ValidationException::field('columns', 'invalid');
            }
            $names[$key] = true;
            if ($column['id'] !== null) {
                if (!in_array($column['id'], $known, true) || isset($ids[$column['id']])) {
                    throw ValidationException::field('columns', 'invalid');
                }
                $ids[$column['id']] = true;
            }
            array_push($stateIds, ...$column['state_ids']);
        }

        $active = $this->workflows->activeIds($code);
        if (count($stateIds) !== count($active) || array_diff($stateIds, $active) !== []) {
            throw ValidationException::field('state_ids', 'invalid');
        }
    }

    /**
     * @param list<array{id: string|null, name: string, state_ids: list<string>}> $columns
     * @return list<string> the states the arrangement places
     */
    private function movedOut(array $columns): array
    {
        $placed = [];
        foreach ($columns as $column) {
            array_push($placed, ...$column['state_ids']);
        }

        return $placed;
    }

    /** @return array<string, string> state names by id */
    private function stateNames(WorkflowCode $code): array
    {
        $names = [];
        foreach ($this->workflows->list($code, 'all') as $state) {
            $names[$state->id] = $state->name;
        }

        return $names;
    }

    /**
     * @param list<BoardColumnRecord> $columns
     * @param array<string, string> $names
     * @return list<string> "Column: State, State", in the order of the board
     */
    private function describe(array $columns, array $names): array
    {
        return array_map(
            static fn (BoardColumnRecord $column): string => $column->name . ': ' . implode(', ', array_map(
                static fn (string $id): string => $names[$id] ?? $id,
                $column->stateIds,
            )),
            $columns,
        );
    }
}
