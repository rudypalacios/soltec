<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Console;

/** The terminal as a console command sees it, so tests can script the answers. */
interface ConsoleIo
{
    public function writeLine(string $text): void;

    public function ask(string $prompt): string;

    /** Reads a secret without echoing it when the terminal allows it. */
    public function askSecret(string $prompt): string;
}
