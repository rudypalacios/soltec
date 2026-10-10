<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Application;

/**
 * The department and direct manager sent in an update. "Sent as null" clears the field and "not sent" leaves it as
 * it is, so each value travels with a flag.
 */
final class OrganizationChange
{
    public function __construct(
        public readonly bool $departmentSent = false,
        public readonly ?string $departmentId = null,
        public readonly bool $managerSent = false,
        public readonly ?string $managerId = null,
    ) {
    }
}
