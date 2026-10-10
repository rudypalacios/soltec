<?php

declare(strict_types=1);

namespace Soltec\Kernel;

use Psr\Log\LoggerInterface;
use Throwable;

/**
 * Runs the work when the request ends. With PHP-FPM the response is closed first (`fastcgi_finish_request`), so the
 * caller does not wait. Where that function does not exist the work still runs, but the caller waits for it: the
 * response is then slower for the cases that had work to do (docs/arquitectura/autenticacion-y-roles.md).
 */
final class ShutdownTasks implements DeferredTasks
{
    /** @var list<callable(): void> */
    private array $tasks = [];
    private bool $registered = false;

    public function __construct(private readonly LoggerInterface $logger)
    {
    }

    public function defer(callable $task): void
    {
        $this->tasks[] = $task;
        if (!$this->registered) {
            register_shutdown_function($this->run(...));
            $this->registered = true;
        }
    }

    /** Public so a test can run the queue; in production only the shutdown handler calls it. */
    public function run(): void
    {
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        }
        $tasks = $this->tasks;
        $this->tasks = [];
        foreach ($tasks as $task) {
            try {
                $task();
            } catch (Throwable $error) {
                // Nobody is waiting for an answer any more: the failure can only be logged.
                $this->logger->error('A deferred task failed.', ['exception' => $error]);
            }
        }
    }
}
