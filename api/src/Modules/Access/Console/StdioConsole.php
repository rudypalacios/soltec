<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Console;

/** The real terminal: standard input and output. */
final class StdioConsole implements ConsoleIo
{
    public function writeLine(string $text): void
    {
        fwrite(STDOUT, $text . PHP_EOL);
    }

    public function ask(string $prompt): string
    {
        fwrite(STDOUT, $prompt);

        return $this->readLine();
    }

    public function askSecret(string $prompt): string
    {
        fwrite(STDOUT, $prompt);
        $hidden = stream_isatty(STDIN) && $this->stty('-echo');
        if (stream_isatty(STDIN) && !$hidden) {
            fwrite(STDOUT, '(this terminal cannot hide the input) ');
        }
        try {
            return $this->readLine();
        } finally {
            if ($hidden) {
                $this->stty('echo');
                fwrite(STDOUT, PHP_EOL);
            }
        }
    }

    private function readLine(): string
    {
        $line = fgets(STDIN);

        return $line === false ? '' : rtrim($line, "\r\n");
    }

    private function stty(string $mode): bool
    {
        if (!function_exists('shell_exec') || str_contains((string) ini_get('disable_functions'), 'shell_exec')) {
            return false;
        }

        return shell_exec('stty ' . $mode . ' 2>/dev/null') !== null;
    }
}
