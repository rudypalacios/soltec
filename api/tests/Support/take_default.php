<?php

// Child process of MarginLevelConcurrencyTest: keeps moving the default margin level among the given ids.
// Usage: php take_default.php <how many moves> <id> <id> ...

declare(strict_types=1);

use Soltec\Kernel\Bootstrap;
use Soltec\Kernel\Config;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Settings\Application\MarginLevelService;

require dirname(__DIR__, 2) . '/vendor/autoload.php';

[, $moves] = $argv;
$ids = array_slice($argv, 2);

$settings = ['APP_ENV' => 'testing'];
foreach (['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS'] as $key) {
    $settings[$key] = (string) getenv($key);
}
$container = Bootstrap::createContainer(dirname(__DIR__, 2), new Config($settings));
$service = $container->get(MarginLevelService::class);
assert($service instanceof MarginLevelService);

$actor = ActorContext::system();
for ($i = 0; $i < (int) $moves; $i++) {
    $service->setDefault($actor, $ids[$i % count($ids)]);
}
