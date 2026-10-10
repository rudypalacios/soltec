<?php

// Child process of SequenceConcurrencyTest: takes numbers in short transactions and prints each one.
// Usage: php take_numbers.php <sequence code> <how many> <hold microseconds>

declare(strict_types=1);

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Bootstrap;
use Soltec\Kernel\Config;
use Soltec\Modules\Settings\Application\SequenceGenerator;

require dirname(__DIR__, 2) . '/vendor/autoload.php';

[, $code, $count, $hold] = $argv + [null, 'client', '10', '0'];

$settings = ['APP_ENV' => 'testing'];
foreach (['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS'] as $key) {
    $settings[$key] = (string) getenv($key);
}
$container = Bootstrap::createContainer(dirname(__DIR__, 2), new Config($settings));
$generator = $container->get(SequenceGenerator::class);
$connection = $container->get(Connection::class);
assert($generator instanceof SequenceGenerator && $connection instanceof Connection);

for ($i = 0; $i < (int) $count; $i++) {
    $connection->transactional(static function () use ($generator, $code, $hold): void {
        echo $generator->next((string) $code), "\n";
        usleep((int) $hold); // Holds the row lock, so the other processes really queue behind it.
    });
}
