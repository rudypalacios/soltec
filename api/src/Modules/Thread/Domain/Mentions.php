<?php

declare(strict_types=1);

namespace Soltec\Modules\Thread\Domain;

/**
 * The `@[user-id]` marks a comment carries. The text keeps the id, not the name, so a renamed person still reads
 * right; the screen swaps each mark for the name the server returns in `mentions`.
 */
final class Mentions
{
    private const PATTERN = '/@\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/';

    /**
     * The distinct ids mentioned, in order of appearance.
     *
     * @return list<string>
     */
    public static function idsIn(string $body): array
    {
        preg_match_all(self::PATTERN, $body, $matches);

        return array_values(array_unique(array_map('strval', $matches[1])));
    }
}
