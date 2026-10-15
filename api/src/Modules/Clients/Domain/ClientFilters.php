<?php

declare(strict_types=1);

namespace Soltec\Modules\Clients\Domain;

/** What narrows the list of clients. `status` is the activity: active, inactive or all. */
final class ClientFilters
{
    public function __construct(
        public readonly ?string $text,
        public readonly string $status,
        public readonly ?string $type,
        public readonly ?string $statusId,
        public readonly ?string $segmentId,
        public readonly ?string $sellerId,
    ) {
    }
}
