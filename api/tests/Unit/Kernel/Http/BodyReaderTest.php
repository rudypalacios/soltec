<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel\Http;

use PHPUnit\Framework\TestCase;
use Slim\Psr7\Factory\StreamFactory;
use Soltec\Kernel\Http\BodyReader;
use Soltec\Tests\Support\ChunkedStream;

final class BodyReaderTest extends TestCase
{
    public function testReadsTheWholeBodyEvenWhenTheStreamHandsItOutInChunks(): void
    {
        $payload = random_bytes(42_131);

        self::assertSame($payload, BodyReader::read(ChunkedStream::of($payload), 1_048_576));
    }

    public function testStopsOneByteOverTheLimit(): void
    {
        $bytes = BodyReader::read(ChunkedStream::of(str_repeat('x', 30_000)), 20_000);

        self::assertSame(20_001, strlen($bytes), 'Enough to tell the body is too large, without loading all of it.');
    }

    public function testReadsFromTheStartEvenIfSomethingAlreadyReadIt(): void
    {
        $stream = (new StreamFactory())->createStream('abcdef');
        $stream->getContents();

        self::assertSame('abcdef', BodyReader::read($stream, 100));
    }

    public function testAnEmptyBodyIsAnEmptyString(): void
    {
        self::assertSame('', BodyReader::read((new StreamFactory())->createStream(''), 100));
    }
}
