<?php

declare(strict_types=1);

namespace Soltec\Kernel;

/**
 * Work that must happen after the response is sent, so how long it takes cannot be told from outside (sending the
 * email of a password recovery would otherwise show whether the account exists). Tests run it at once.
 */
interface DeferredTasks
{
    /** @param callable(): void $task */
    public function defer(callable $task): void;
}
