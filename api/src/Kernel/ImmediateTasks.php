<?php

declare(strict_types=1);

namespace Soltec\Kernel;

/** Runs the work right away: for tests and for places where nobody is waiting for a response. */
final class ImmediateTasks implements DeferredTasks
{
    public function defer(callable $task): void
    {
        $task();
    }
}
