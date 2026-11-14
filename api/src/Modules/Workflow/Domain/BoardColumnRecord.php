<?php

declare(strict_types=1);

namespace Soltec\Modules\Workflow\Domain;

/**
 * A column of the board of a flow: one or more states shown together. Every state belongs to exactly one column.
 * The color is the one of its first state, so a column of a single state looks like the state.
 */
final class BoardColumnRecord
{
    /**
     * @param list<string> $stateIds the active states of the column, in the order of the flow
     * @param list<string> $allStateIds the states of the column, active or not: the ones whose records it shows
     */
    public function __construct(
        public readonly string $id,
        public readonly WorkflowCode $workflow,
        public readonly string $name,
        public readonly int $sortOrder,
        public readonly string $color,
        public readonly bool $isFinal,
        public readonly array $stateIds,
        public readonly array $allStateIds,
    ) {
    }

    /** @return array<string, mixed> the `BoardColumn` schema of the contract */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'workflow' => $this->workflow->value,
            'name' => $this->name,
            'sort_order' => $this->sortOrder,
            'color' => $this->color,
            'is_final' => $this->isFinal,
            'state_ids' => $this->stateIds,
        ];
    }
}
