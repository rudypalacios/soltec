<?php

declare(strict_types=1);

use Soltec\Kernel\Bootstrap;

// In the repository this file is "api/public/index.php"; on the server it is "public/api/index.php".
// Going up two levels and entering "api/" resolves the application root in both layouts.
$appRoot = dirname(__DIR__, 2) . '/api';

require $appRoot . '/vendor/autoload.php';

Bootstrap::createApp($appRoot)->run();
