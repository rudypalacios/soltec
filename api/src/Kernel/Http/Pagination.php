<?php

declare(strict_types=1);

namespace Soltec\Kernel\Http;

/** Page of a list: the request side (`page`, `per_page`) and the `meta` of the response. */
final class Pagination
{
    public function __construct(public readonly int $page, public readonly int $perPage)
    {
    }

    public function offset(): int
    {
        return ($this->page - 1) * $this->perPage;
    }

    /** @return array{page: int, per_page: int, total: int} */
    public function meta(int $total): array
    {
        return ['page' => $this->page, 'per_page' => $this->perPage, 'total' => $total];
    }
}
