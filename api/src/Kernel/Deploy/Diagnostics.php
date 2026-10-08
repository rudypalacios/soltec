<?php

declare(strict_types=1);

namespace Soltec\Kernel\Deploy;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Paths;
use Throwable;

/**
 * Reports what the hosting really provides, so the design assumptions can be checked on the
 * real server (MySQL 5.7 behaviour, WebP support, mail, limits). It never exposes secrets or paths.
 */
final class Diagnostics
{
    private const REQUIRED_EXTENSIONS = ['pdo_mysql', 'mbstring', 'gd', 'fileinfo', 'openssl', 'curl', 'intl'];

    public function __construct(
        private readonly Connection $connection,
        private readonly Paths $paths,
    ) {
    }

    /** @return array<string, mixed> */
    public function collect(): array
    {
        return [
            'php' => [
                'version' => PHP_VERSION,
                'sapi' => PHP_SAPI,
                'memory_limit' => (string) ini_get('memory_limit'),
                'max_execution_time' => (string) ini_get('max_execution_time'),
                'upload_max_filesize' => (string) ini_get('upload_max_filesize'),
                'post_max_size' => (string) ini_get('post_max_size'),
            ],
            'extensions' => $this->extensions(),
            'images' => [
                'webp_encode' => function_exists('imagewebp'),
                'jpeg_decode' => function_exists('imagecreatefromjpeg'),
            ],
            'mail' => ['mail_function' => function_exists('mail')],
            'storage' => ['writable' => $this->isStorageWritable()],
            'database' => $this->database(),
        ];
    }

    /** @return array<string, bool> */
    private function extensions(): array
    {
        $loaded = [];
        foreach (self::REQUIRED_EXTENSIONS as $extension) {
            $loaded[$extension] = extension_loaded($extension);
        }

        return $loaded;
    }

    private function isStorageWritable(): bool
    {
        $directory = $this->paths->storageDirectory();

        return is_dir($directory) && is_writable($directory);
    }

    /** @return array<string, mixed> */
    private function database(): array
    {
        try {
            return [
                'server_version' => $this->scalar('SELECT VERSION()'),
                'sql_mode' => $this->scalar('SELECT @@sql_mode'),
                'generated_column_unique' => $this->generatedColumnUniqueness(),
            ];
        } catch (Throwable $error) {
            return ['error' => 'The database is not reachable.'];
        }
    }

    private function scalar(string $sql): string
    {
        $value = $this->connection->fetchOne($sql);

        return is_scalar($value) ? (string) $value : '';
    }

    /**
     * Checks the pattern the design relies on to keep a value unique among active records:
     * a stored generated column that is NULL for deactivated rows, with a unique index on it.
     * Uses a temporary table, so nothing remains in the schema.
     *
     * @return array{supported: bool, error: string|null}
     */
    private function generatedColumnUniqueness(): array
    {
        try {
            $this->connection->executeStatement(
                'CREATE TEMPORARY TABLE soltec_probe ('
                . 'id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, '
                . 'code VARCHAR(20) NOT NULL, '
                . 'deleted_at DATETIME NULL, '
                . 'active_code VARCHAR(20) GENERATED ALWAYS AS (IF(deleted_at IS NULL, code, NULL)) STORED, '
                . 'UNIQUE KEY uq_soltec_probe_active_code (active_code))',
            );
            $this->connection->executeStatement("INSERT INTO soltec_probe (code) VALUES ('A')");

            $duplicateRejected = false;
            try {
                $this->connection->executeStatement("INSERT INTO soltec_probe (code) VALUES ('A')");
            } catch (Throwable) {
                $duplicateRejected = true;
            }

            $this->connection->executeStatement('UPDATE soltec_probe SET deleted_at = NOW() WHERE id = 1');
            $this->connection->executeStatement("INSERT INTO soltec_probe (code) VALUES ('A')");

            return ['supported' => $duplicateRejected, 'error' => null];
        } catch (Throwable $error) {
            return ['supported' => false, 'error' => $error->getMessage()];
        } finally {
            try {
                $this->connection->executeStatement('DROP TEMPORARY TABLE IF EXISTS soltec_probe');
            } catch (Throwable) {
                // Nothing to clean up if the connection itself failed.
            }
        }
    }
}
