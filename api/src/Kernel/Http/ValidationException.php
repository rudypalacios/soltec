<?php

declare(strict_types=1);

namespace Soltec\Kernel\Http;

/** Invalid input: 422 `validation_failed` with one entry per wrong field. */
final class ValidationException extends ApiException
{
    /** @param list<array{field: string, code: string}> $errors */
    public function __construct(public readonly array $errors)
    {
        parent::__construct(422, 'validation_failed', 'Validation failed');
    }

    public static function field(string $field, string $code): self
    {
        return new self([['field' => $field, 'code' => $code]]);
    }
}
