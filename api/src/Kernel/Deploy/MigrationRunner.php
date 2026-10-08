<?php

declare(strict_types=1);

namespace Soltec\Kernel\Deploy;

use Doctrine\DBAL\Connection;
use PDO;
use Phinx\Config\Config as PhinxConfig;
use Phinx\Migration\Manager;
use Soltec\Kernel\Config;
use Soltec\Kernel\Paths;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\BufferedOutput;

/**
 * Applies pending Phinx migrations from inside a web request (the hosting has no shell, ADR-0003).
 *
 * A database lock keeps two deployments from migrating at the same time. MySQL cannot roll back
 * schema changes, so a failed migration can leave the schema half-applied: keep migrations small.
 */
final class MigrationRunner
{
    private const LOCK_NAME = 'soltec_migrations';
    private const ENVIRONMENT = 'app';

    public function __construct(
        private readonly Connection $connection,
        private readonly Paths $paths,
        private readonly Config $config,
    ) {
    }

    /**
     * @return list<string> the migrations applied by this call, as "version name"
     * @throws MigrationInProgressException when another migration run holds the lock
     */
    public function apply(): array
    {
        if ((int) $this->connection->fetchOne('SELECT GET_LOCK(?, 0)', [self::LOCK_NAME]) !== 1) {
            throw new MigrationInProgressException('Another migration run is in progress.');
        }

        try {
            $manager = $this->manager();
            $before = $this->pending($manager);
            $manager->migrate(self::ENVIRONMENT);
            $after = $this->pending($manager);

            return array_values(array_diff_key($before, $after));
        } finally {
            $this->connection->fetchOne('SELECT RELEASE_LOCK(?)', [self::LOCK_NAME]);
        }
    }

    private function manager(): Manager
    {
        $pdo = $this->connection->getNativeConnection();
        if (!$pdo instanceof PDO) {
            throw new \LogicException('Phinx needs a PDO connection.');
        }

        $phinx = new PhinxConfig([
            'paths' => ['migrations' => $this->paths->migrationsDirectory()],
            'environments' => [
                'default_migration_table' => 'phinxlog',
                'default_environment' => self::ENVIRONMENT,
                self::ENVIRONMENT => [
                    'adapter' => 'mysql',
                    'connection' => $pdo,
                    'name' => $this->config->string('DB_NAME'),
                ],
            ],
        ]);

        return new Manager($phinx, new ArrayInput([]), new BufferedOutput());
    }

    /** @return array<int|string, string> pending migrations keyed by version */
    private function pending(Manager $manager): array
    {
        $applied = $manager->getEnvironment(self::ENVIRONMENT)->getVersions();
        $pending = [];
        foreach ($manager->getMigrations(self::ENVIRONMENT) as $version => $migration) {
            if (!in_array($version, $applied, false)) {
                $pending[$version] = sprintf('%s %s', $version, $migration->getName());
            }
        }

        return $pending;
    }
}
