<?php

declare(strict_types=1);

namespace Soltec\Tests\Support;

use Soltec\Kernel\DeferredTasks;

/** Keeps the work "after the response" without running it: the way a command that sends the emails itself sees it. */
final class CollectedTasks implements DeferredTasks
{
    /** @var list<callable(): void> */
    public array $tasks = [];

    public function defer(callable $task): void
    {
        $this->tasks[] = $task;
    }
}
