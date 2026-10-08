<?php

declare(strict_types=1);

namespace Soltec\Kernel;

use DI\ContainerBuilder;
use Doctrine\DBAL\Connection;
use Psr\Container\ContainerInterface;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Log\LoggerInterface;
use Slim\App;
use Slim\Factory\AppFactory;
use Slim\Psr7\Factory\ResponseFactory;
use Soltec\Kernel\Db\ConnectionFactory;
use Soltec\Kernel\Http\ProblemDetailsErrorHandler;
use Soltec\Kernel\Http\SecurityHeadersMiddleware;
use Soltec\Kernel\Logging\LoggerFactory;

use function DI\factory;

/** Builds the Slim application: container, middleware and routes. */
final class Bootstrap
{
    /**
     * @param Config|null $config settings to use; null reads the .env file and the environment
     * @return App<ContainerInterface>
     */
    public static function createApp(string $appRoot, ?Config $config = null): App
    {
        $paths = new Paths($appRoot);
        $config ??= Config::fromEnvironment($paths);

        $container = (new ContainerBuilder())
            ->addDefinitions([
                Paths::class => $paths,
                Config::class => $config,
                ResponseFactoryInterface::class => new ResponseFactory(),
                Connection::class => factory(
                    static fn (Config $settings): Connection => ConnectionFactory::create($settings),
                ),
                LoggerInterface::class => factory(
                    static fn (Config $settings, Paths $locations): LoggerInterface => LoggerFactory::create(
                        $settings,
                        $locations,
                    ),
                ),
            ])
            ->build();

        AppFactory::setContainer($container);
        $app = AppFactory::create();
        $app->setBasePath($config->string('APP_BASE_PATH', '/api'));

        $app->addRoutingMiddleware();
        $app->addBodyParsingMiddleware();

        $errors = $app->addErrorMiddleware($config->isDebug(), false, false);
        $errors->setDefaultErrorHandler(ProblemDetailsErrorHandler::class);

        // Added last so it is the outermost layer and also covers the error responses.
        $app->add(SecurityHeadersMiddleware::class);

        /** @var callable(App<ContainerInterface>): void $routes */
        $routes = require $appRoot . '/config/routes.php';
        $routes($app);

        return $app;
    }
}
