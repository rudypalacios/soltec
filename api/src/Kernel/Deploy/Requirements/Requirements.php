<?php

declare(strict_types=1);

namespace Soltec\Kernel\Deploy\Requirements;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Config;
use Soltec\Kernel\Db\ConnectionFactory;
use Soltec\Kernel\Deploy\Diagnostics;
use Soltec\Kernel\Paths;
use Throwable;

/**
 * Checks, before anyone relies on an instance, everything the person setting it up has to provide:
 * PHP, the .env file, the database and its privileges, folders and HTTPS. It is the installer-style
 * pre-flight list for moving the system to a new hosting; Diagnostics holds the raw facts it reuses.
 *
 * It never changes data: the only write is a probe table that is dropped in the same request.
 */
final class Requirements
{
    private const MINIMUM_PHP = '8.3.0';
    private const MINIMUM_MEMORY = '128M';
    // Photos (milestone 3) are uploaded from phones: 16 MB each, with room for the request around them.
    private const MINIMUM_UPLOAD = '16M';
    private const MINIMUM_POST = '24M';
    private const MINIMUM_EXECUTION_SECONDS = 30;
    private const PROBE_TABLE = 'soltec_requirements_probe';

    public function __construct(
        private readonly Config $config,
        private readonly Paths $paths,
    ) {
    }

    /**
     * @param string $documentRoot the web server's document root for this request
     * @param bool   $isHttps      whether the request reached the server over HTTPS
     */
    public function evaluate(string $documentRoot, bool $isHttps): RequirementsReport
    {
        return new RequirementsReport([
            ...$this->php(),
            ...$this->configuration($documentRoot, $isHttps),
            ...$this->storage(),
            ...$this->database(),
        ]);
    }

    /** @return list<RequirementCheck> */
    private function php(): array
    {
        $checks = [];
        $checks[] = version_compare(PHP_VERSION, self::MINIMUM_PHP, '>=')
            ? RequirementCheck::pass('php.version', 'php', 'PHP ' . PHP_VERSION)
            : new RequirementCheck(
                'php.version',
                'php',
                CheckStatus::Fail,
                'PHP ' . PHP_VERSION . ' is too old.',
                'Select PHP 8.3 for this subdomain in cPanel > MultiPHP Manager.',
            );

        foreach (Diagnostics::REQUIRED_EXTENSIONS as $extension) {
            $checks[] = extension_loaded($extension)
                ? RequirementCheck::pass('php.ext.' . $extension, 'php', 'Extension ' . $extension)
                : new RequirementCheck(
                    'php.ext.' . $extension,
                    'php',
                    CheckStatus::Fail,
                    'Extension ' . $extension . ' is not loaded.',
                    'Enable it in cPanel > Select PHP Version > Extensions.',
                );
        }

        $checks[] = function_exists('imagewebp')
            ? RequirementCheck::pass('php.webp', 'php', 'GD can encode WebP')
            : new RequirementCheck(
                'php.webp',
                'php',
                CheckStatus::Warn,
                'GD cannot encode WebP.',
                'Photos need it from milestone 3; ask the host for a PHP build whose GD supports WebP.',
            );

        $checks[] = $this->atLeast('memory_limit', self::MINIMUM_MEMORY, 'Decoding phone photos');
        $checks[] = $this->atLeast('upload_max_filesize', self::MINIMUM_UPLOAD, 'Photos');
        $checks[] = $this->atLeast('post_max_size', self::MINIMUM_POST, 'Photos');

        $seconds = (int) ini_get('max_execution_time');
        $checks[] = $seconds === 0 || $seconds >= self::MINIMUM_EXECUTION_SECONDS
            ? RequirementCheck::pass('php.max_execution_time', 'php', 'max_execution_time ' . $seconds . ' s')
            : new RequirementCheck(
                'php.max_execution_time',
                'php',
                CheckStatus::Warn,
                sprintf('max_execution_time is %d s.', $seconds),
                sprintf('Raise it to %d s or more: migrations and PDFs are slow.', self::MINIMUM_EXECUTION_SECONDS),
            );

        return $checks;
    }

    /** @return list<RequirementCheck> */
    private function configuration(string $documentRoot, bool $isHttps): array
    {
        $deployed = $this->paths->isDeployed();
        $checks = [];

        $envFile = $this->paths->envDirectory() . '/.env';
        $checks[] = is_file($envFile)
            ? RequirementCheck::pass('config.env_file', 'config', '.env found next to public/')
            : new RequirementCheck(
                'config.env_file',
                'config',
                $deployed ? CheckStatus::Fail : CheckStatus::Warn,
                'There is no .env file in the instance folder.',
                'Create it from api/.env.example with permissions 600 (docs/despliegue.md, section 2.1).',
            );

        $missing = array_values(array_filter(
            ['DB_NAME', 'DB_USER'],
            fn (string $key): bool => $this->config->optionalString($key) === null,
        ));
        $checks[] = $missing === []
            ? RequirementCheck::pass('config.database_settings', 'config', 'DB_NAME and DB_USER are set')
            : new RequirementCheck(
                'config.database_settings',
                'config',
                CheckStatus::Fail,
                'Missing in the .env: ' . implode(', ', $missing) . '.',
                'Use the full names cPanel shows (it prefixes the account name).',
            );

        $appEnv = $this->config->optionalString('APP_ENV');
        $checks[] = $appEnv === 'production' || !$deployed
            ? RequirementCheck::pass('config.app_env', 'config', 'APP_ENV ' . ($appEnv ?? 'unset'))
            : new RequirementCheck(
                'config.app_env',
                'config',
                CheckStatus::Warn,
                'APP_ENV is not "production" on a deployed instance.',
                'Error details are shown to visitors outside production. Set APP_ENV=production.',
            );

        $checks[] = $deployed
            ? RequirementCheck::pass('config.layout', 'config', 'public/, api/ and db/ are side by side')
            : new RequirementCheck(
                'config.layout',
                'config',
                CheckStatus::Warn,
                'Running from the repository layout, not the deployed one.',
                'Expected on a developer machine; on a server it means public/ is missing next to api/.',
            );

        if ($deployed) {
            $checks[] = $this->documentRoot($documentRoot);
        }

        $checks[] = $isHttps
            ? RequirementCheck::pass('config.https', 'config', 'The request arrived over HTTPS')
            : new RequirementCheck(
                'config.https',
                'config',
                CheckStatus::Warn,
                'The request did not arrive over HTTPS.',
                'Check that AutoSSL is active for the subdomain and enable "Force HTTPS Redirect" in cPanel.',
            );

        return $checks;
    }

    /** The document root must be public/: if it is the instance folder, .env and api/ are served by URL. */
    private function documentRoot(string $documentRoot): RequirementCheck
    {
        $actual = realpath($documentRoot);
        $public = realpath($this->paths->instanceRoot() . '/public');
        $instance = realpath($this->paths->instanceRoot());

        if ($actual !== false && $actual === $public) {
            return RequirementCheck::pass('config.document_root', 'config', 'The document root is public/');
        }
        if ($actual !== false && $actual === $instance) {
            return new RequirementCheck(
                'config.document_root',
                'config',
                CheckStatus::Fail,
                'The document root is the instance folder: .env and api/ can be requested by URL.',
                'Set the Document Root to <instance folder>/public in cPanel > Domains, then change the DB password'
                    . ' and DEPLOY_TOKEN.',
            );
        }

        return new RequirementCheck(
            'config.document_root',
            'config',
            CheckStatus::Warn,
            'The document root could not be matched with public/.',
            'Open /.env in a browser: it must answer 403 or 404.',
        );
    }

    /** @return list<RequirementCheck> */
    private function storage(): array
    {
        $storage = $this->paths->storageDirectory();
        $migrations = $this->paths->migrationsDirectory();
        $migrationFiles = glob($migrations . '/*.php');

        return [
            is_dir($storage) && is_writable($storage)
                ? RequirementCheck::pass('storage.writable', 'storage', 'storage/ is writable')
                : new RequirementCheck(
                    'storage.writable',
                    'storage',
                    CheckStatus::Fail,
                    'storage/ is missing or not writable.',
                    'Create storage/ in the instance folder, next to .env, with write permission for the PHP user.',
                ),
            $migrationFiles !== false && $migrationFiles !== []
                ? RequirementCheck::pass('storage.migrations', 'storage', count($migrationFiles) . ' migration file(s)')
                : new RequirementCheck(
                    'storage.migrations',
                    'storage',
                    CheckStatus::Fail,
                    'No migration files found in db/migrations.',
                    'The deployment uploads them; check the FTP account points at the instance folder.',
                ),
        ];
    }

    /** @return list<RequirementCheck> */
    private function database(): array
    {
        try {
            $connection = ConnectionFactory::create($this->config);
            $version = $connection->fetchOne('SELECT VERSION()');
            $version = is_string($version) ? $version : '';
        } catch (Throwable $error) {
            return [new RequirementCheck(
                'db.connection',
                'database',
                CheckStatus::Fail,
                'Cannot connect to the database: ' . $error->getMessage(),
                'Check DB_HOST, DB_NAME, DB_USER and DB_PASS in the .env, and that the user is added to the database.',
            )];
        }

        $facts = (new Diagnostics($connection, $this->paths))->collect();
        $uniqueIndex = is_array($facts['database'] ?? null) ? $facts['database'] : [];
        $probe = $this->probeSchemaPrivileges($connection);
        $applied = $this->migrationsTableExists($connection);

        return [
            RequirementCheck::pass('db.connection', 'database', 'Connected to MySQL ' . $version),
            $this->databaseVersion($version),
            $this->generatedColumn($uniqueIndex),
            $probe === null
                ? RequirementCheck::pass('db.privileges', 'database', 'The user can alter the schema')
                : new RequirementCheck(
                    'db.privileges',
                    'database',
                    CheckStatus::Fail,
                    'The database user lacks schema privileges: ' . $probe,
                    'Grant SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES and'
                        . ' CREATE TEMPORARY TABLES (not ALL PRIVILEGES). If the table ' . self::PROBE_TABLE
                        . ' remains, drop it.',
                ),
            $applied
                ? RequirementCheck::pass('db.migrations', 'database', 'The migrations table exists')
                : new RequirementCheck(
                    'db.migrations',
                    'database',
                    CheckStatus::Warn,
                    'No migration has been applied yet.',
                    'Expected on a new instance: the deployment applies them (POST /api/system/migrations/apply).',
                ),
        ];
    }

    private function databaseVersion(string $version): RequirementCheck
    {
        if (stripos($version, 'mariadb') !== false) {
            return new RequirementCheck(
                'db.version',
                'database',
                CheckStatus::Warn,
                'MariaDB ' . $version . ' is not the supported engine.',
                'The design targets MySQL 5.7 or 8.0 (ADR-0001); MariaDB is untested.',
            );
        }

        return version_compare($version, '5.7.0', '>=')
            ? RequirementCheck::pass('db.version', 'database', 'MySQL ' . $version . ' (5.7 or newer)')
            : new RequirementCheck(
                'db.version',
                'database',
                CheckStatus::Fail,
                'MySQL ' . $version . ' is older than 5.7.',
                'Generated columns and the unique-among-active pattern need MySQL 5.7 or newer.',
            );
    }

    /** @param array<string, mixed> $database */
    private function generatedColumn(array $database): RequirementCheck
    {
        $probe = $database['generated_column_unique'] ?? null;
        $supported = is_array($probe) && ($probe['supported'] ?? false) === true;

        return $supported
            ? RequirementCheck::pass('db.generated_column', 'database', 'Unique index on a generated column works')
            : new RequirementCheck(
                'db.generated_column',
                'database',
                CheckStatus::Fail,
                'A unique index on a generated column does not work on this server.',
                'The design keeps values unique among active records with it (ADR-0001); use MySQL 5.7 or newer.',
            );
    }

    /** @return string|null the database error, or null when every schema operation worked */
    private function probeSchemaPrivileges(Connection $connection): ?string
    {
        $table = self::PROBE_TABLE;

        try {
            // Starting with DROP also checks that privilege and clears a leftover from an earlier failure.
            $connection->executeStatement("DROP TABLE IF EXISTS {$table}");
            $connection->executeStatement(
                "CREATE TABLE {$table} ("
                . 'id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, '
                . 'parent_id INT UNSIGNED NULL, '
                . "CONSTRAINT fk_{$table} FOREIGN KEY (parent_id) REFERENCES {$table} (id)"
                . ') ENGINE=InnoDB',
            );
            $connection->executeStatement("ALTER TABLE {$table} ADD COLUMN note VARCHAR(10) NULL");
            $connection->executeStatement("CREATE INDEX idx_{$table}_note ON {$table} (note)");
            $connection->executeStatement("DROP TABLE {$table}");

            return null;
        } catch (Throwable $error) {
            return $error->getMessage();
        }
    }

    private function migrationsTableExists(Connection $connection): bool
    {
        try {
            return $connection->fetchOne("SHOW TABLES LIKE 'phinxlog'") !== false;
        } catch (Throwable) {
            return false;
        }
    }

    private function atLeast(string $setting, string $minimum, string $neededFor): RequirementCheck
    {
        $id = 'php.' . $setting;
        $value = (string) ini_get($setting);
        if (IniSize::toBytes($value) >= IniSize::toBytes($minimum)) {
            return RequirementCheck::pass($id, 'php', sprintf('%s %s', $setting, $value));
        }

        return new RequirementCheck(
            $id,
            'php',
            CheckStatus::Warn,
            sprintf('%s is %s; at least %s is recommended.', $setting, $value, $minimum),
            sprintf('%s needs it. Raise it in cPanel > MultiPHP INI Editor.', $neededFor),
        );
    }
}
