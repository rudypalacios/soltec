<?php

declare(strict_types=1);

namespace Soltec\Modules\Catalog\Domain;

/**
 * The foreign key a catalog list has to a parent list (a product group belongs to an area). The API names the column
 * in requests and filters (`area_id`) and shows the parent as a named reference under `key` (`area`).
 */
final class ParentLink
{
    public function __construct(
        /** Column in the child table and field in requests, e.g. `area_id`. */
        public readonly string $column,
        /** Table of the parent, e.g. `areas`. */
        public readonly string $table,
        /** Key of the named reference in responses, e.g. `area`. */
        public readonly string $key,
    ) {
    }
}
