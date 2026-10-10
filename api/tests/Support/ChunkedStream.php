<?php

declare(strict_types=1);

namespace Soltec\Tests\Support;

use Slim\Psr7\Stream;

/**
 * A PSR-7 stream that hands out at most 8192 bytes per read(), the way php://input can on some servers. A reader
 * that trusts a single read() to return everything gets only the first chunk.
 */
final class ChunkedStream
{
    private const CHUNK = 8192;
    private const SCHEME = 'chunked';

    /** @var resource|null set by PHP when it opens the stream */
    public $context;
    private static string $payload = '';
    private int $position = 0;

    public static function of(string $payload): Stream
    {
        if (!in_array(self::SCHEME, stream_get_wrappers(), true)) {
            stream_wrapper_register(self::SCHEME, self::class);
        }
        self::$payload = $payload;
        $resource = fopen(self::SCHEME . '://payload', 'r');
        if ($resource === false) {
            throw new \RuntimeException('Cannot open the chunked stream.');
        }

        return new Stream($resource);
    }

    public function stream_open(): bool
    {
        return true;
    }

    public function stream_read(int $count): string
    {
        $chunk = substr(self::$payload, $this->position, min($count, self::CHUNK));
        $this->position += strlen($chunk);

        return $chunk;
    }

    public function stream_eof(): bool
    {
        return $this->position >= strlen(self::$payload);
    }

    public function stream_tell(): int
    {
        return $this->position;
    }

    public function stream_seek(int $offset, int $whence): bool
    {
        $this->position = $whence === SEEK_SET ? $offset : $this->position;

        return true;
    }

    /** @return array<string, int> */
    public function stream_stat(): array
    {
        return ['size' => strlen(self::$payload)];
    }

    public function stream_set_option(int $option, int $arg1, ?int $arg2): bool
    {
        return false;
    }
}
