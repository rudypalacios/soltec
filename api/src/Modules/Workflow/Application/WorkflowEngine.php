<?php

declare(strict_types=1);

namespace Soltec\Modules\Workflow\Application;

use Soltec\Modules\Workflow\Domain\WorkflowCode;
use Soltec\Modules\Workflow\Domain\WorkflowStateRecord;
use Soltec\Modules\Workflow\Persistence\WorkflowRepository;

/**
 * What the modules that own a record with a state ask of a flow: where a new record starts and whether it may move.
 * It only reads the configuration; keeping the state in the record, and the thread entry for a change, belong to the
 * module that owns the record.
 */
final class WorkflowEngine
{
    public function __construct(private readonly WorkflowRepository $workflows)
    {
    }

    /** The id of the state a new record starts in, or null when the flow has none configured. */
    public function initialStateId(WorkflowCode $code): ?string
    {
        return $this->workflows->initialStateId($code);
    }

    /** True when both states are active states of the flow and the administrator linked them. */
    public function canTransition(WorkflowCode $code, string $fromStateId, string $toStateId): bool
    {
        return $this->workflows->transitionAllowed($code, $fromStateId, $toStateId);
    }

    /** A state of the flow, active or not (a record keeps showing the state it is in after it is deactivated). */
    public function state(WorkflowCode $code, string $stateId): ?WorkflowStateRecord
    {
        return $this->workflows->find($code, $stateId);
    }

    /**
     * The active states a record in `$fromStateId` may move to, in the order of the flow.
     *
     * @return list<WorkflowStateRecord>
     */
    public function nextStates(WorkflowCode $code, string $fromStateId): array
    {
        $from = $this->workflows->find($code, $fromStateId);
        if ($from === null) {
            return [];
        }

        return array_values(array_filter(
            $this->workflows->list($code, 'active'),
            static fn (WorkflowStateRecord $state): bool => in_array($state->id, $from->transitionsTo, true),
        ));
    }
}
