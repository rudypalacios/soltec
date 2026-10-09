<?php

declare(strict_types=1);

namespace Soltec\Kernel\Http;

use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Uuid;

/**
 * Reads and validates the JSON body (or the query string) of a request.
 *
 * Every read records its own field error instead of stopping at the first one, and `done()` throws them all
 * together as a 422, so a form can show every wrong field at once.
 */
final class Input
{
    /** @var list<array{field: string, code: string}> */
    private array $errors = [];

    /** @param array<array-key, mixed> $data */
    private function __construct(private readonly array $data, private readonly string $prefix = '')
    {
    }

    /**
     * Reads a nested object; its field errors are reported as "<prefix>.<field>", for example "device.platform".
     *
     * @param array<array-key, mixed> $data
     */
    public static function nested(string $prefix, array $data): self
    {
        return new self($data, $prefix . '.');
    }

    /** Merges the errors of a nested read into this one. */
    public function absorb(self $nested): void
    {
        array_push($this->errors, ...$nested->errors);
    }

    public static function body(ServerRequestInterface $request): self
    {
        $body = $request->getParsedBody();
        if (!is_array($body) || array_is_list($body) && $body !== []) {
            throw ValidationException::field('body', 'invalid');
        }

        return new self($body);
    }

    public static function query(ServerRequestInterface $request): self
    {
        return new self($request->getQueryParams());
    }

    public function has(string $field): bool
    {
        return array_key_exists($field, $this->data);
    }

    /** A trimmed text with a length in characters between $min and $max. Null when optional and absent. */
    public function text(string $field, int $min, int $max, bool $required = true): ?string
    {
        $value = $this->data[$field] ?? null;
        if ($value === null) {
            return $this->missing($field, $required);
        }
        if (!is_string($value)) {
            return $this->reject($field, 'invalid');
        }
        $value = trim($value);
        $length = mb_strlen($value);
        if ($length < $min) {
            return $this->reject($field, $min === 1 ? 'required' : 'too_short');
        }
        if ($length > $max) {
            return $this->reject($field, 'too_long');
        }

        return $value;
    }

    /** Like text() but a null or empty value means "no value", for nullable columns. */
    public function nullableText(string $field, int $max): ?string
    {
        $value = $this->data[$field] ?? null;
        if ($value === null || $value === '') {
            return null;
        }

        return $this->text($field, 1, $max);
    }

    /** A string used as is (passwords: never trimmed). Its policy is checked elsewhere. */
    public function secret(string $field, int $maxBytes = 72): ?string
    {
        $value = $this->data[$field] ?? null;
        if ($value === null || $value === '') {
            return $this->missing($field, true);
        }
        if (!is_string($value)) {
            return $this->reject($field, 'invalid');
        }

        return strlen($value) > $maxBytes ? $this->reject($field, 'too_long') : $value;
    }

    /** An email address in lower case. */
    public function email(string $field): ?string
    {
        $value = $this->text($field, 1, 190);
        if ($value === null) {
            return null;
        }
        if (filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
            return $this->reject($field, 'invalid');
        }

        return mb_strtolower($value);
    }

    /**
     * @param list<string> $allowed
     * @return string|null the value, or $default when absent
     */
    public function choice(string $field, array $allowed, ?string $default = null): ?string
    {
        $value = $this->data[$field] ?? null;
        if ($value === null || $value === '') {
            return $default ?? $this->missing($field, true);
        }

        return is_string($value) && in_array($value, $allowed, true) ? $value : $this->reject($field, 'invalid');
    }

    /** @return list<string>|null a list of distinct valid UUIDs with at least one item */
    public function uuidList(string $field, bool $required = true): ?array
    {
        $value = $this->data[$field] ?? null;
        if ($value === null) {
            return $this->missing($field, $required);
        }
        if (!is_array($value) || !array_is_list($value) || $value === []) {
            return $this->reject($field, $value === [] ? 'required' : 'invalid');
        }
        $ids = [];
        foreach ($value as $item) {
            if (!is_string($item) || !Uuid::isValid($item)) {
                return $this->reject($field, 'invalid');
            }
            $ids[] = $item;
        }

        return count(array_unique($ids)) === count($ids) ? $ids : $this->reject($field, 'invalid');
    }

    /** The `version` the client read; at least 1. */
    public function version(string $field = 'version'): ?int
    {
        $value = $this->data[$field] ?? null;
        if ($value === null) {
            return $this->missing($field, true);
        }

        return is_int($value) && $value >= 1 ? $value : $this->reject($field, 'invalid');
    }

    /** @return array<array-key, mixed>|null a JSON object (not a list) */
    public function object(string $field, bool $required = true): ?array
    {
        $value = $this->data[$field] ?? null;
        if ($value === null) {
            return $this->missing($field, $required);
        }
        if (!is_array($value) || ($value !== [] && array_is_list($value))) {
            return $this->reject($field, 'invalid');
        }

        return $value;
    }

    /** `page` and `per_page` of a list request. */
    public function pagination(): Pagination
    {
        $page = $this->positiveInt('page', 1, 1, PHP_INT_MAX);
        $perPage = $this->positiveInt('per_page', 25, 1, 100);

        return new Pagination($page, $perPage);
    }

    public function fail(string $field, string $code): void
    {
        $this->errors[] = ['field' => $this->prefix . $field, 'code' => $code];
    }

    /** @throws ValidationException when any read failed */
    public function done(): void
    {
        if ($this->errors !== []) {
            throw new ValidationException($this->errors);
        }
    }

    private function positiveInt(string $field, int $default, int $min, int $max): int
    {
        $value = $this->data[$field] ?? null;
        if ($value === null || $value === '') {
            return $default;
        }
        $number = filter_var($value, FILTER_VALIDATE_INT);
        if ($number === false || $number < $min || $number > $max) {
            $this->reject($field, 'out_of_range');

            return $default;
        }

        return $number;
    }

    private function missing(string $field, bool $required): null
    {
        if ($required) {
            $this->fail($field, 'required');
        }

        return null;
    }

    private function reject(string $field, string $code): null
    {
        $this->fail($field, $code);

        return null;
    }
}
