<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Settings;

/**
 * The invariant of CLAUDE.md section 4: numbers are unique and safe under concurrency. Real processes against the
 * real database, because a single PHP process cannot race itself.
 */
final class SequenceConcurrencyTest extends SettingsTestCase
{
    private const PROCESSES = 6;
    private const PER_PROCESS = 20;

    public function testSimultaneousProcessesGetDifferentConsecutiveNumbers(): void
    {
        $numbers = [];
        foreach ($this->runChildren('client') as $output) {
            $numbers = array_merge($numbers, array_filter(explode("\n", $output)));
        }

        $total = self::PROCESSES * self::PER_PROCESS;
        self::assertCount($total, $numbers);
        self::assertCount($total, array_unique($numbers), 'No number was issued twice.');
        $expected = array_map(static fn (int $n): string => sprintf('CLI-%04d', $n), range(1, $total));
        sort($numbers);
        self::assertSame($expected, $numbers, 'No gaps either.');
        $counter = $this->connection->fetchOne("SELECT next_value FROM sequences WHERE code = 'client'");
        self::assertSame($total + 1, is_numeric($counter) ? (int) $counter : null);
    }

    /** @return list<string> the output of each child process */
    private function runChildren(string $code): array
    {
        $script = dirname(__DIR__, 2) . '/Support/take_numbers.php';
        $processes = [];
        for ($i = 0; $i < self::PROCESSES; $i++) {
            $command = [PHP_BINARY, $script, $code, (string) self::PER_PROCESS, '1000'];
            $handle = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
            self::assertIsResource($handle);
            $processes[] = [$handle, $pipes];
        }

        $outputs = [];
        foreach ($processes as [$handle, $pipes]) {
            $outputs[] = (string) stream_get_contents($pipes[1]);
            $errors = (string) stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            self::assertSame(0, proc_close($handle), 'A child process failed: ' . $errors);
        }

        return $outputs;
    }
}
