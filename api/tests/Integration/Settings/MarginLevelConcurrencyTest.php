<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Settings;

use Soltec\Kernel\Uuid;

/**
 * There is always exactly one active default margin level, even when several people move it at the same moment.
 * Real processes against the real database, because a single PHP process cannot race itself.
 */
final class MarginLevelConcurrencyTest extends SettingsTestCase
{
    private const PROCESSES = 4;
    private const MOVES = 25;

    public function testSimultaneousChangesOfTheDefaultLeaveExactlyOne(): void
    {
        $this->api('POST', '/margin-levels', $this->adminToken, ['name' => 'Tercero', 'rate' => '0.4']);
        $ids = [];
        foreach ($this->connection->fetchFirstColumn('SELECT LOWER(HEX(id)) FROM margin_levels') as $hex) {
            self::assertIsString($hex);
            $ids[] = Uuid::fromHex($hex);
        }
        self::assertCount(3, $ids);

        $processes = [];
        for ($i = 0; $i < self::PROCESSES; $i++) {
            // Each process starts at a different level so they really contend.
            $rotated = array_merge(array_slice($ids, $i % 3), array_slice($ids, 0, $i % 3));
            $script = dirname(__DIR__, 2) . '/Support/take_default.php';
            $command = [PHP_BINARY, $script, (string) self::MOVES, ...$rotated];
            $handle = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
            self::assertIsResource($handle);
            $processes[] = [$handle, $pipes];
        }
        foreach ($processes as [$handle, $pipes]) {
            $output = (string) stream_get_contents($pipes[1]) . (string) stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            self::assertSame(0, proc_close($handle), 'A child process failed: ' . $output);
        }

        self::assertSame(
            1,
            $this->countRows('SELECT COUNT(*) FROM margin_levels WHERE is_default = 1 AND deleted_at IS NULL'),
        );
    }
}
