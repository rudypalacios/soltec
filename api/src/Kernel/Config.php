<?php

declare(strict_types=1);

namespace Soltec\Kernel;

use Dotenv\Dotenv;

/**
 * Read-only access to the environment settings.
 *
 * Settings are validated when they are read, not at startup: a deploy that ships new code with an
 * older .env must not take the whole site down, only the feature that needs the missing setting.
 */
final class Config
{
    /** @param array<string, string> $values */
    public function __construct(private readonly array $values)
    {
    }

    /** Loads the ".env" file when present and reads the process environment. */
    public static function fromEnvironment(Paths $paths): self
    {
        Dotenv::createMutable($paths->envDirectory(), '.env')->safeLoad();

        $values = [];
        foreach (array_merge($_ENV, $_SERVER) as $key => $value) {
            if (is_string($key) && is_string($value)) {
                $values[$key] = $value;
            }
        }

        return new self($values);
    }

    public function string(string $key, ?string $default = null): string
    {
        $value = $this->optionalString($key) ?? $default;

        return $value ?? throw ConfigurationException::missing($key);
    }

    /** Returns null when the setting is absent or empty. */
    public function optionalString(string $key): ?string
    {
        $value = $this->values[$key] ?? null;

        return $value === null || $value === '' ? null : $value;
    }

    public function int(string $key, ?int $default = null): int
    {
        $raw = $this->optionalString($key);
        if ($raw === null) {
            return $default ?? throw ConfigurationException::missing($key);
        }
        if (filter_var($raw, FILTER_VALIDATE_INT) === false) {
            throw ConfigurationException::invalid($key, 'it must be an integer.');
        }

        return (int) $raw;
    }

    public function isDebug(): bool
    {
        return in_array($this->optionalString('APP_ENV'), ['local', 'testing'], true);
    }
}
