<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Domain;

/** What a list of users is filtered by, besides the caller's data scope. */
final class UserFilter
{
    /**
     * @param string $status active, inactive or all
     * @param list<string> $excludeIds users left out, such as those who cannot be someone's manager
     */
    public function __construct(
        public readonly ?string $text = null,
        public readonly string $status = 'active',
        public readonly ?string $type = null,
        public readonly ?string $roleId = null,
        public readonly ?string $departmentId = null,
        public readonly array $excludeIds = [],
    ) {
    }
}
