<?php

declare(strict_types=1);

namespace Soltec\Kernel\Http;

/** Invalid input: 422 `validation_failed` with one entry per wrong field. */
final class ValidationException extends ApiException
{
    /**
     * @param list<array{field: string, code: string}> $errors
     * @param array<string, int|string|bool> $extensions extra members of the problem body, such as the minimum
     *     length a too short password missed
     */
    public function __construct(public readonly array $errors, array $extensions = [])
    {
        parent::__construct(422, 'validation_failed', 'Validation failed', null, $extensions);
    }

    /** @param array<string, int|string|bool> $extensions */
    public static function field(string $field, string $code, array $extensions = []): self
    {
        return new self([['field' => $field, 'code' => $code]], $extensions);
    }
}
