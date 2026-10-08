<?php

declare(strict_types=1);

namespace Soltec\Kernel;

use RuntimeException;

/** Raised when a setting that a feature needs is missing or invalid. */
final class ConfigurationException extends RuntimeException
{
    public static function missing(string $key): self
    {
        return new self(sprintf('The setting "%s" is missing. Add it to the .env file.', $key));
    }

    public static function invalid(string $key, string $reason): self
    {
        return new self(sprintf('The setting "%s" is invalid: %s', $key, $reason));
    }
}
