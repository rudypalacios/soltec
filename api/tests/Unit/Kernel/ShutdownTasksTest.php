<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel;

use PHPUnit\Framework\TestCase;
use RuntimeException;
use Soltec\Kernel\ShutdownTasks;
use Soltec\Tests\Support\RecordingLogger;

final class ShutdownTasksTest extends TestCase
{
    public function testTasksRunInOrderOnlyWhenTheQueueIsRun(): void
    {
        $ran = [];
        $tasks = new ShutdownTasks(new RecordingLogger());

        $tasks->defer(function () use (&$ran): void {
            $ran[] = 'first';
        });
        $tasks->defer(function () use (&$ran): void {
            $ran[] = 'second';
        });
        self::assertSame([], $ran);

        $tasks->run();
        self::assertSame(['first', 'second'], $ran);
    }

    public function testAFailingTaskIsLoggedAndDoesNotStopTheOthers(): void
    {
        $logger = new RecordingLogger();
        $ran = false;
        $tasks = new ShutdownTasks($logger);

        $tasks->defer(static function (): void {
            throw new RuntimeException('boom');
        });
        $tasks->defer(function () use (&$ran): void {
            $ran = true;
        });
        $tasks->run();

        self::assertTrue($ran);
        self::assertSame(['A deferred task failed.'], $logger->messages);
    }

    public function testATaskRunsOnlyOnce(): void
    {
        $count = 0;
        $tasks = new ShutdownTasks(new RecordingLogger());
        $tasks->defer(function () use (&$count): void {
            $count++;
        });

        $tasks->run();
        $tasks->run();

        self::assertSame(1, $count);
    }
}
