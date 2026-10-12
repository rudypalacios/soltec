<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Domain;

use DateTimeImmutable;

/** What narrows the audit log: who did it, to what, what and when. Every part is optional. */
final class AuditFilter
{
    public function __construct(
        public readonly ?string $userId = null,
        public readonly ?string $entityType = null,
        public readonly ?string $entityId = null,
        public readonly ?string $action = null,
        public readonly ?DateTimeImmutable $from = null,
        public readonly ?DateTimeImmutable $to = null,
    ) {
    }
}
