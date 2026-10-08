<?php

declare(strict_types=1);

namespace Soltec\Kernel\Db;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\DriverManager;
use PDO;
use Soltec\Kernel\Config;

/** Builds the Doctrine DBAL connection from the environment settings. */
final class ConnectionFactory
{
    public static function create(Config $config): Connection
    {
        return DriverManager::getConnection([
            'driver' => 'pdo_mysql',
            'host' => $config->string('DB_HOST', '127.0.0.1'),
            'port' => $config->int('DB_PORT', 3306),
            'dbname' => $config->string('DB_NAME'),
            'user' => $config->string('DB_USER'),
            'password' => $config->string('DB_PASS', ''),
            'charset' => 'utf8mb4',
            'driverOptions' => [
                // Dates are stored in UTC; the application is the only clock (see ADR-0012).
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+00:00'",
            ],
        ]);
    }
}
