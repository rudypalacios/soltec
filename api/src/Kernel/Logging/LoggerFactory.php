<?php

declare(strict_types=1);

namespace Soltec\Kernel\Logging;

use Monolog\Handler\RotatingFileHandler;
use Monolog\Handler\StreamHandler;
use Monolog\Level;
use Monolog\Logger;
use Psr\Log\LoggerInterface;
use Soltec\Kernel\Config;
use Soltec\Kernel\Paths;

/** Writes rotating log files under storage/logs, or to stderr when that directory is not writable. */
final class LoggerFactory
{
    private const KEPT_FILES = 14;

    public static function create(Config $config, Paths $paths): LoggerInterface
    {
        $level = $config->isDebug() ? Level::Debug : Level::Warning;
        $directory = $paths->storageDirectory() . '/logs';

        if (!is_dir($directory)) {
            // The directory may be created concurrently by another request.
            @mkdir($directory, 0775, true);
        }

        $handler = is_dir($directory) && is_writable($directory)
            ? new RotatingFileHandler($directory . '/app.log', self::KEPT_FILES, $level)
            : new StreamHandler('php://stderr', $level);

        return new Logger('soltec', [$handler]);
    }
}
