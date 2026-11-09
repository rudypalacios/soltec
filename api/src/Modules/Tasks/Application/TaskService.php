<?php

declare(strict_types=1);

namespace Soltec\Modules\Tasks\Application;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Access\Persistence\UserDirectory;
use Soltec\Modules\Tasks\Domain\TaskData;
use Soltec\Modules\Tasks\Domain\TaskRecord;
use Soltec\Modules\Tasks\Persistence\TaskRepository;
use Soltec\Modules\Thread\Application\ThreadService;
use Soltec\Modules\Workflow\Application\WorkflowEngine;
use Soltec\Modules\Workflow\Domain\WorkflowCode;

/**
 * Tasks. The owner (whoever creates the task) asks and the assignee does; the state follows the `task` flow of the
 * workflow engine. Who moves a task: the assignee or the owner, except that closing it, or reopening a closed one, is
 * the owner's alone. Every change that matters (creation, state, assignee, due date) is written into the thread inside
 * the same transaction. Deactivating never blocks (ADR-0023).
 */
final class TaskService
{
    public const THREAD = 'task';
    private const ENTITY = 'tasks';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly TaskRepository $tasks,
        private readonly WorkflowEngine $workflow,
        private readonly ThreadService $thread,
        private readonly UserDirectory $users,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return array{records: list<TaskRecord>, total: int} */
    public function list(
        CurrentUser $caller,
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
        return $this->tasks->search(
            $caller,
            $text,
            $status,
            $relation,
            $stateId,
            $taskTypeId,
            $assigneeId,
            $dueBefore,
            $openOnly,
            $page,
        );
    }

    public function get(CurrentUser $caller, string $id): TaskRecord
    {
        return $this->tasks->find($id, $caller) ?? throw ApiException::notFound();
    }

    /**
     * The states the caller may move the task to: the ones the flow links from its state, minus the ones the rule of
     * who-moves-what denies them. Empty for an inactive task.
     *
     * @return list<array{id: string, name: string, color: string}>
     */
    public function nextStates(CurrentUser $caller, TaskRecord $task): array
    {
        if (!$task->isActive()) {
            return [];
        }
        $next = [];
        foreach ($this->workflow->nextStates(WorkflowCode::Task, $task->stateId) as $state) {
            if ($this->mayMove($caller, $task, $task->stateIsTerminal, $state->isTerminal)) {
                $next[] = ['id' => $state->id, 'name' => $state->name, 'color' => $state->color];
            }
        }

        return $next;
    }

    /**
     * The caller becomes the owner; the task starts in the initial state of the flow.
     *
     * @throws ValidationException `task_type_id` `not_found`; `assignee_id` `not_found` or `same_as_owner`
     * @throws ApiException 409 `not_configured` when the flow has no initial state
     */
    public function create(CurrentUser $caller, ActorContext $actor, TaskData $data): TaskRecord
    {
        $id = Uuid::v7();
        $this->connection->transactional(function () use ($caller, $actor, $data, $id): void {
            $this->assertReferences($caller->id, $data);
            $stateId = $this->workflow->initialStateId(WorkflowCode::Task)
                ?? throw ApiException::notConfigured('the task workflow');
            $now = $this->clock->now();
            $this->tasks->insert($id, $data, $caller->id, $stateId, $now);
            $this->thread->recordEvent(self::THREAD, $id, $caller->id, 'created', [
                'assignee' => $this->person($data->assigneeId),
                'due_date' => $data->dueDate,
            ], $now);
            $this->audit->record(
                $actor,
                'create',
                self::ENTITY,
                $id,
                null,
                $data->toArray() + ['owner_id' => $caller->id, 'state_id' => $stateId, 'is_active' => true],
            );
        });

        return $this->get($caller, $id);
    }

    /**
     * Replaces the data of the task. A closed task cannot be changed. A new assignee or due date goes to the thread.
     *
     * @throws ApiException 404, 409 `conflict` (stale version), `task_closed` or `task_inactive`
     * @throws ValidationException like {@see create()}
     */
    public function update(
        CurrentUser $caller,
        ActorContext $actor,
        string $id,
        int $version,
        TaskData $data,
    ): TaskRecord {
        $this->connection->transactional(function () use ($caller, $actor, $id, $version, $data): void {
            if (!$this->tasks->lock($id)) {
                throw ApiException::notFound();
            }
            $current = $this->get($caller, $id);
            $this->assertOpen($current);
            $this->assertReferences($current->ownerId, $data, $current->data);

            $now = $this->clock->now();
            if (!$this->tasks->update($id, $version, $data, $now)) {
                throw ApiException::conflict();
            }
            if ($data->assigneeId !== $current->data->assigneeId) {
                $this->thread->recordEvent(self::THREAD, $id, $caller->id, 'assignee_changed', [
                    'from' => ['id' => $current->data->assigneeId, 'name' => $current->assigneeName],
                    'to' => $this->person($data->assigneeId),
                ], $now);
            }
            if ($data->dueDate !== $current->data->dueDate) {
                $this->thread->recordEvent(self::THREAD, $id, $caller->id, 'due_date_changed', [
                    'from' => $current->data->dueDate,
                    'to' => $data->dueDate,
                ], $now);
            }

            $before = $current->data->toArray();
            $after = $data->toArray();
            $changed = array_keys(array_filter(
                $after,
                static fn (?string $value, string $field): bool => $value !== $before[$field],
                ARRAY_FILTER_USE_BOTH,
            ));
            if ($changed !== []) {
                $this->audit->record(
                    $actor,
                    'update',
                    self::ENTITY,
                    $id,
                    array_intersect_key($before, array_flip($changed)),
                    array_intersect_key($after, array_flip($changed)),
                );
            }
        });

        return $this->get($caller, $id);
    }

    /**
     * Moves the task to another state of its flow. `$reason` and `$proposedDueDate` are what an assignee who cannot
     * make the date writes when they send the task back; the owner may accept the proposed date, which becomes the
     * due date.
     *
     * @throws ApiException 404, 403 `forbidden` (not yours to move), 409 `conflict` or `task_inactive`
     * @throws ValidationException `state_id` `transition_not_allowed`
     */
    public function transition(
        CurrentUser $caller,
        ActorContext $actor,
        string $id,
        int $version,
        string $toStateId,
        ?string $reason,
        ?string $proposedDueDate,
        bool $acceptProposedDueDate,
    ): TaskRecord {
        $this->connection->transactional(function () use (
            $caller,
            $actor,
            $id,
            $version,
            $toStateId,
            $reason,
            $proposedDueDate,
            $acceptProposedDueDate,
        ): void {
            if (!$this->tasks->lock($id)) {
                throw ApiException::notFound();
            }
            $current = $this->get($caller, $id);
            if (!$current->isActive()) {
                throw ApiException::conflict('task_inactive', 'An inactive task cannot change state.');
            }
            $to = $this->workflow->state(WorkflowCode::Task, $toStateId);
            if ($to === null || !$this->workflow->canTransition(WorkflowCode::Task, $current->stateId, $toStateId)) {
                throw ValidationException::field('state_id', 'transition_not_allowed');
            }
            if (!$this->mayMove($caller, $current, $current->stateIsTerminal, $to->isTerminal)) {
                throw ApiException::forbidden('forbidden', 'This change of state belongs to the other person.');
            }

            $accepted = $acceptProposedDueDate && $caller->id === $current->ownerId;
            $newDueDate = $accepted ? $current->proposedDueDate : null;
            $now = $this->clock->now();
            if (!$this->tasks->moveTo($id, $version, $toStateId, $proposedDueDate, $newDueDate, $now)) {
                throw ApiException::conflict();
            }
            $this->thread->recordEvent(self::THREAD, $id, $caller->id, 'state_changed', [
                'from' => ['id' => $current->stateId, 'name' => $current->stateName],
                'to' => ['id' => $to->id, 'name' => $to->name],
                'reason' => $reason,
                'proposed_due_date' => $proposedDueDate,
            ], $now);
            if ($newDueDate !== null && $newDueDate !== $current->data->dueDate) {
                $this->thread->recordEvent(self::THREAD, $id, $caller->id, 'due_date_changed', [
                    'from' => $current->data->dueDate,
                    'to' => $newDueDate,
                ], $now);
            }
            $this->audit->record(
                $actor,
                'update',
                self::ENTITY,
                $id,
                ['state_id' => $current->stateId, 'proposed_due_date' => $current->proposedDueDate]
                + ($newDueDate === null ? [] : ['due_date' => $current->data->dueDate]),
                ['state_id' => $toStateId, 'proposed_due_date' => $proposedDueDate]
                + ($newDueDate === null ? [] : ['due_date' => $newDueDate]),
            );
        });

        return $this->get($caller, $id);
    }

    /** Idempotent. */
    public function deactivate(CurrentUser $caller, ActorContext $actor, string $id): TaskRecord
    {
        return $this->setActive($caller, $actor, $id, false);
    }

    /** Idempotent. */
    public function reactivate(CurrentUser $caller, ActorContext $actor, string $id): TaskRecord
    {
        return $this->setActive($caller, $actor, $id, true);
    }

    /**
     * The people a task can be assigned to: any active internal user.
     *
     * @return list<array{id: string, name: string}>
     */
    public function assigneeOptions(?string $text, int $limit): array
    {
        return $this->users->search($text, $limit);
    }

    private function setActive(CurrentUser $caller, ActorContext $actor, string $id, bool $active): TaskRecord
    {
        $this->connection->transactional(function () use ($caller, $actor, $id, $active): void {
            if (!$this->tasks->lock($id)) {
                throw ApiException::notFound();
            }
            $task = $this->get($caller, $id);
            if ($task->isActive() === $active) {
                return;
            }

            $now = $this->clock->now();
            $this->tasks->setDeletedAt($id, $active ? null : $now, $now);
            $this->audit->record(
                $actor,
                $active ? 'reactivate' : 'deactivate',
                self::ENTITY,
                $id,
                ['is_active' => !$active],
                ['is_active' => $active],
            );
        });

        return $this->get($caller, $id);
    }

    /**
     * Closing a task, or reopening a closed one, is the owner's; any other step belongs to the assignee or the owner.
     * Whoever only reaches the task through their scope moves nothing.
     */
    private function mayMove(CurrentUser $caller, TaskRecord $task, bool $fromTerminal, bool $toTerminal): bool
    {
        if ($caller->id === $task->ownerId) {
            return true;
        }

        return $caller->id === $task->data->assigneeId && !$fromTerminal && !$toTerminal;
    }

    /** @throws ApiException 409 `task_inactive` or `task_closed` */
    private function assertOpen(TaskRecord $task): void
    {
        if (!$task->isActive()) {
            throw ApiException::conflict('task_inactive', 'An inactive task cannot be changed.');
        }
        if ($task->stateIsTerminal) {
            throw ApiException::conflict('task_closed', 'A closed task cannot be changed.');
        }
    }

    /**
     * The task type must be active and the assignee an active internal user other than the owner. A value the task
     * already has is accepted as is, so an old task can be edited after its type was deactivated.
     */
    private function assertReferences(string $ownerId, TaskData $data, ?TaskData $current = null): void
    {
        if ($data->taskTypeId !== $current?->taskTypeId && !$this->tasks->taskTypeIsActive($data->taskTypeId)) {
            throw ValidationException::field('task_type_id', 'not_found');
        }
        if ($data->assigneeId === $ownerId) {
            throw ValidationException::field('assignee_id', 'same_as_owner');
        }
        if ($data->assigneeId !== $current?->assigneeId && !$this->users->isActiveInternal($data->assigneeId)) {
            throw ValidationException::field('assignee_id', 'not_found');
        }
    }

    /** @return array{id: string, name: string} */
    private function person(string $userId): array
    {
        $found = $this->users->activeAmong([$userId]);

        return $found[0] ?? ['id' => $userId, 'name' => ''];
    }
}
