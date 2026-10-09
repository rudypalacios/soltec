<?php

declare(strict_types=1);

namespace Soltec\Tests\Support;

use Soltec\Modules\Access\Console\ConsoleIo;

/** A terminal that answers from a script and records what the command printed. */
final class ScriptedConsole implements ConsoleIo
{
    /** @var list<string> */
    private array $lines = [];

    /**
     * @param list<string> $answers
     * @param list<string> $secrets
     */
    public function __construct(private array $answers, private array $secrets)
    {
    }

    public function writeLine(string $text): void
    {
        $this->lines[] = $text;
    }

    public function ask(string $prompt): string
    {
        return array_shift($this->answers) ?? '';
    }

    public function askSecret(string $prompt): string
    {
        return array_shift($this->secrets) ?? '';
    }

    public function output(): string
    {
        return implode("\n", $this->lines);
    }

    /** @return list<string> */
    public function unusedAnswers(): array
    {
        return [...$this->answers, ...$this->secrets];
    }
}
