<?php

declare(strict_types=1);

namespace Soltec\Tests\Support;

use Psr\Log\AbstractLogger;
use Stringable;

/** Keeps the messages it receives so a test can assert on them. */
final class RecordingLogger extends AbstractLogger
{
    /** @var list<string> */
    public array $messages = [];

    public function log(mixed $level, string|Stringable $message, array $context = []): void
    {
        $this->messages[] = (string) $message;
    }
}
