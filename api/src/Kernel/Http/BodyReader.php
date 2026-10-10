<?php

declare(strict_types=1);

namespace Soltec\Kernel\Http;

use Psr\Http\Message\StreamInterface;

/** Reads the raw body of a request (an uploaded file), which JSON parsing does not cover. */
final class BodyReader
{
    private const CHUNK = 65536;

    /**
     * Reads the body from its start until it ends or one byte more than $max has been read, enough for the caller to
     * tell it is too large without loading all of it. PSR-7 lets `read()` return fewer bytes than asked (PHP hands out
     * `php://input` in chunks on some servers), so a single call would cut the file short.
     */
    public static function read(StreamInterface $body, int $max): string
    {
        if ($body->isSeekable()) {
            $body->rewind();
        }

        $bytes = '';
        while (!$body->eof() && strlen($bytes) <= $max) {
            $chunk = $body->read(min(self::CHUNK, $max + 1 - strlen($bytes)));
            if ($chunk === '') {
                break;
            }
            $bytes .= $chunk;
        }

        return $bytes;
    }
}
