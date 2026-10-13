<?php

declare(strict_types=1);

namespace Soltec\Modules\Catalog\Domain;

/**
 * One catalog list (a parameter or a part of the product structure): the table that holds it, the permission
 * resource that guards it and the names the API gives
 * it. The five parameters differ only in these values (and in the optional color), so one set of code serves them all
 * (ADR-0016).
 */
final class ParameterDefinition
{
    public function __construct(
        /** Last segment of the route, e.g. `client-statuses`. */
        public readonly string $slug,
        /** Table and permission resource, e.g. `client_statuses`. */
        public readonly string $table,
        /** Route placeholder, e.g. `clientStatusId`. */
        public readonly string $idParameter,
        /** Whether each value carries a `#RRGGBB` color. */
        public readonly bool $hasColor = false,
        /** Longest name accepted; it is the column's width. */
        public readonly int $nameMax = 100,
        /** Set when each value belongs to a value of another list. */
        public readonly ?ParentLink $parent = null,
        /** Set when values of another list belong to each value of this one. */
        public readonly ?ChildLink $children = null,
    ) {
    }
}
