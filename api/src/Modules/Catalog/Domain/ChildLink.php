<?php

declare(strict_types=1);

namespace Soltec\Modules\Catalog\Domain;

/**
 * The other side of a ParentLink: a list whose values cannot be deactivated while active values of another list point
 * at them (ADR-0023). The refusal says how many there are.
 */
final class ChildLink
{
    public function __construct(
        /** Table that points here, e.g. `product_groups`. */
        public readonly string $table,
        /** Column of that table holding the foreign key, e.g. `area_id`. */
        public readonly string $column,
        /** Count shown in responses and in the refusal, e.g. `active_group_count`. */
        public readonly string $countField,
        /** Error code of the refusal, e.g. `area_in_use`. */
        public readonly string $errorCode,
    ) {
    }
}
