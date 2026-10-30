<?php

declare(strict_types=1);

namespace Soltec\Modules\Workflow\Application;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Workflow\Domain\WorkflowCode;
use Soltec\Modules\Workflow\Domain\WorkflowStateRecord;
use Soltec\Modules\Workflow\Persistence\WorkflowRepository;

/**
 * Administration of the states of a flow and of the transitions between them. Deactivating a state never touches
 * the records that are in it: they keep it, and it simply stops being a destination. Every write takes the flow's
 * lock first, so the rules that look at the whole flow (one initial state, at least one terminal state) hold when
 * two administrators work at once.
 */
final class WorkflowStateService
{
    private const ENTITY = 'workflow_states';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly WorkflowRepository $workflows,
        private readonly AuditLogger $audit,
    ) {
    }

    /**
     * @param string $status active, inactive or all
     * @return list<WorkflowStateRecord>
     */
    public function list(WorkflowCode $code, string $status): array
    {
        return $this->workflows->list($code, $status);
    }

    public function get(WorkflowCode $code, string $id): WorkflowStateRecord
    {
        return $this->workflows->find($code, $id) ?? throw ApiException::notFound();
    }

    /** A new state goes at the end of the flow, without transitions: the administrator links it afterwards. */
    public function create(
        ActorContext $actor,
        WorkflowCode $code,
        string $name,
        string $color,
        bool $isTerminal,
    ): WorkflowStateRecord {
        $id = Uuid::v7();
        try {
            $this->connection->transactional(function () use ($actor, $code, $id, $name, $color, $isTerminal): void {
                $this->workflows->lockFlow($code);
                $this->workflows->insert(
                    $id,
                    $code,
                    $name,
                    $color,
                    $this->workflows->nextSortOrder($code),
                    $isTerminal,
                    $this->clock->now(),
                );
                $this->audit->record($actor, 'create', self::ENTITY, $id, null, [
                    'workflow' => $code->value,
                    'name' => $name,
                    'color' => $color,
                    'is_terminal' => $isTerminal,
                    'is_active' => true,
                ]);
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('name', 'taken');
        }

        return $this->get($code, $id);
    }

    /**
     * `$makeInitial` moves the initial flag to this state; it cannot be taken away without giving it to another.
     *
     * @throws ApiException 404, 409 `conflict` (stale version) or 409 `last_terminal_state`
     */
    public function update(
        ActorContext $actor,
        WorkflowCode $code,
        string $id,
        int $version,
        string $name,
        string $color,
        bool $isTerminal,
        bool $makeInitial,
    ): WorkflowStateRecord {
        try {
            $this->connection->transactional(function () use (
                $actor,
                $code,
                $id,
                $version,
                $name,
                $color,
                $isTerminal,
                $makeInitial,
            ): void {
                $this->workflows->lockFlow($code);
                $state = $this->get($code, $id);
                $isInitial = $state->isInitial || $makeInitial;
                $this->assertFlags($code, $state, $isInitial, $isTerminal, $makeInitial);

                $now = $this->clock->now();
                if ($makeInitial && !$state->isInitial) {
                    $this->workflows->clearInitial($code, $now);
                }
                if (!$this->workflows->update($id, $version, $name, $color, $isInitial, $isTerminal, $now)) {
                    throw ApiException::conflict();
                }

                [$before, $after] = $this->changes($state, $name, $color, $isInitial, $isTerminal);
                if ($after !== []) {
                    $this->audit->record($actor, 'update', self::ENTITY, $id, $before, $after);
                }
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('name', 'taken');
        }

        return $this->get($code, $id);
    }

    /**
     * Idempotent. The initial state stays, and so does the last terminal one: records need somewhere to start and
     * somewhere to end.
     *
     * @throws ApiException 404, 409 `state_is_initial` or 409 `last_terminal_state`
     */
    public function deactivate(ActorContext $actor, WorkflowCode $code, string $id): WorkflowStateRecord
    {
        $this->connection->transactional(function () use ($actor, $code, $id): void {
            $this->workflows->lockFlow($code);
            $state = $this->get($code, $id);
            if (!$state->isActive()) {
                return;
            }
            if ($state->isInitial) {
                throw ApiException::conflict(
                    'state_is_initial',
                    'The initial state cannot be deactivated: choose another initial state first.',
                );
            }
            if ($state->isTerminal && $this->workflows->activeTerminalCount($code) === 1) {
                throw ApiException::conflict(
                    'last_terminal_state',
                    'The flow needs at least one terminal state.',
                );
            }

            $now = $this->clock->now();
            $this->workflows->setDeletedAt($id, $now, $now);
            $this->audit->record($actor, 'deactivate', self::ENTITY, $id, ['is_active' => true], [
                'is_active' => false,
            ]);
        });

        return $this->get($code, $id);
    }

    /** Idempotent. Fails when an active state of the flow already has the same name. */
    public function reactivate(ActorContext $actor, WorkflowCode $code, string $id): WorkflowStateRecord
    {
        try {
            $this->connection->transactional(function () use ($actor, $code, $id): void {
                $this->workflows->lockFlow($code);
                if ($this->get($code, $id)->isActive()) {
                    return;
                }

                $this->workflows->setDeletedAt($id, null, $this->clock->now());
                $this->audit->record($actor, 'reactivate', self::ENTITY, $id, ['is_active' => false], [
                    'is_active' => true,
                ]);
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('name', 'taken');
        }

        return $this->get($code, $id);
    }

    /**
     * Puts the active states in the order given, which must name every one of them. Inactive states keep their
     * place and are listed by it.
     *
     * @param list<string> $ids
     * @return list<WorkflowStateRecord> every state of the flow
     */
    public function reorder(ActorContext $actor, WorkflowCode $code, array $ids): array
    {
        $this->connection->transactional(function () use ($actor, $code, $ids): void {
            $this->workflows->lockFlow($code);
            $current = $this->workflows->activeIds($code);
            if (count($ids) !== count($current) || array_diff($ids, $current) !== []) {
                throw ValidationException::field('ids', 'invalid');
            }
            if ($ids === $current) {
                return;
            }

            $names = $this->namesById($code);
            $now = $this->clock->now();
            foreach ($ids as $position => $id) {
                $this->workflows->setSortOrder($id, $position + 1, $now);
            }
            $this->audit->record($actor, 'update', self::ENTITY, null, [
                'workflow' => $code->value,
                'order' => array_map(static fn (string $id): string => $names[$id] ?? $id, $current),
            ], [
                'workflow' => $code->value,
                'order' => array_map(static fn (string $id): string => $names[$id] ?? $id, $ids),
            ]);
        });

        return $this->workflows->list($code, 'all');
    }

    /**
     * Replaces the transitions among the active states of the flow.
     *
     * @param list<array{string, string}> $pairs from and to state ids
     * @return list<WorkflowStateRecord> every state of the flow
     */
    public function setTransitions(ActorContext $actor, WorkflowCode $code, array $pairs): array
    {
        $this->connection->transactional(function () use ($actor, $code, $pairs): void {
            $this->workflows->lockFlow($code);
            $active = $this->workflows->activeIds($code);
            $seen = [];
            foreach ($pairs as [$from, $to]) {
                if (!in_array($from, $active, true) || !in_array($to, $active, true)) {
                    throw ValidationException::field('transitions', 'not_found');
                }
                if ($from === $to || isset($seen[$from . '>' . $to])) {
                    throw ValidationException::field('transitions', 'invalid');
                }
                $seen[$from . '>' . $to] = true;
            }

            $names = $this->namesById($code);
            $before = $this->describeTransitions($this->workflows->list($code, 'active'), $names);
            $this->workflows->replaceTransitions($code, $pairs);
            $after = $this->describeTransitions($this->workflows->list($code, 'active'), $names);
            if ($before !== $after) {
                $this->audit->record($actor, 'update', self::ENTITY, null, [
                    'workflow' => $code->value,
                    'transitions' => $before,
                ], [
                    'workflow' => $code->value,
                    'transitions' => $after,
                ]);
            }
        });

        return $this->workflows->list($code, 'all');
    }

    private function assertFlags(
        WorkflowCode $code,
        WorkflowStateRecord $state,
        bool $isInitial,
        bool $isTerminal,
        bool $makeInitial,
    ): void {
        if ($makeInitial && !$state->isActive()) {
            throw ValidationException::field('is_initial', 'inactive_state');
        }
        if ($isInitial && $isTerminal) {
            throw ValidationException::field('is_terminal', 'initial_cannot_be_terminal');
        }
        $losesTerminal = $state->isTerminal && !$isTerminal && $state->isActive();
        if ($losesTerminal && $this->workflows->activeTerminalCount($code) === 1) {
            throw ApiException::conflict('last_terminal_state', 'The flow needs at least one terminal state.');
        }
    }

    /**
     * @return array{array<string, mixed>, array<string, mixed>} only the fields that changed
     */
    private function changes(
        WorkflowStateRecord $state,
        string $name,
        string $color,
        bool $isInitial,
        bool $isTerminal,
    ): array {
        $before = [];
        $after = [];
        $fields = [
            'name' => [$state->name, $name],
            'color' => [$state->color, $color],
            'is_initial' => [$state->isInitial, $isInitial],
            'is_terminal' => [$state->isTerminal, $isTerminal],
        ];
        foreach ($fields as $field => [$old, $new]) {
            if ($old !== $new) {
                $before[$field] = $old;
                $after[$field] = $new;
            }
        }

        return [$before, $after];
    }

    /** @return array<string, string> state names by id */
    private function namesById(WorkflowCode $code): array
    {
        $names = [];
        foreach ($this->workflows->list($code, 'all') as $state) {
            $names[$state->id] = $state->name;
        }

        return $names;
    }

    /**
     * @param list<WorkflowStateRecord> $states
     * @param array<string, string> $names
     * @return list<string> "From → To", sorted so the comparison does not depend on the order of the lists
     */
    private function describeTransitions(array $states, array $names): array
    {
        $links = [];
        foreach ($states as $state) {
            foreach ($state->transitionsTo as $to) {
                $links[] = ($names[$state->id] ?? $state->id) . ' → ' . ($names[$to] ?? $to);
            }
        }
        sort($links);

        return $links;
    }
}
