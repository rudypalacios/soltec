<?php

declare(strict_types=1);

namespace Soltec\Kernel;

use DI\Container;
use DI\ContainerBuilder;
use Doctrine\DBAL\Connection;
use Psr\Container\ContainerInterface;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Log\LoggerInterface;
use Slim\App;
use Slim\Factory\AppFactory;
use Slim\Psr7\Factory\ResponseFactory;
use Soltec\Kernel\Auth\CurrentUserLoader;
use Soltec\Kernel\Db\ConnectionFactory;
use Soltec\Kernel\Deploy\Requirements\ModuleRequirements;
use Soltec\Kernel\Http\ProblemDetailsErrorHandler;
use Soltec\Kernel\Http\SecurityHeadersMiddleware;
use Soltec\Kernel\Logging\LoggerFactory;
use Soltec\Kernel\Mail\MailTransport;
use Soltec\Kernel\Mail\PhpMailerTransport;
use Soltec\Modules\Access\Deploy\AccessRequirements;
use Soltec\Modules\Access\Persistence\PermissionLoader;

use function DI\autowire;
use function DI\factory;

/** Builds the Slim application: container, middleware and routes. */
final class Bootstrap
{
    /**
     * @param Config|null $config settings to use; null reads the .env file and the environment
     * @param array<string, mixed> $definitions container entries that replace the defaults (tests inject a clock)
     * @return App<ContainerInterface|null>
     */
    public static function createApp(string $appRoot, ?Config $config = null, array $definitions = []): App
    {
        $config ??= Config::fromEnvironment(new Paths($appRoot));
        $container = self::createContainer($appRoot, $config, $definitions);

        AppFactory::setContainer($container);
        $app = AppFactory::create();
        $app->setBasePath($config->string('APP_BASE_PATH', '/api'));

        $app->addRoutingMiddleware();
        $app->addBodyParsingMiddleware();

        $errors = $app->addErrorMiddleware($config->isDebug(), false, false);
        $errors->setDefaultErrorHandler(ProblemDetailsErrorHandler::class);

        // Added last so it is the outermost layer and also covers the error responses.
        $app->add(SecurityHeadersMiddleware::class);

        /** @var callable(App<ContainerInterface|null>): void $routes */
        $routes = require $appRoot . '/config/routes.php';
        $routes($app);

        return $app;
    }

    /**
     * The services without the HTTP layer, for the console commands.
     *
     * @param array<string, mixed> $definitions
     */
    public static function createContainer(string $appRoot, ?Config $config = null, array $definitions = []): Container
    {
        $paths = new Paths($appRoot);
        $config ??= Config::fromEnvironment($paths);

        return (new ContainerBuilder())
            ->addDefinitions([
                Paths::class => $paths,
                Config::class => $config,
                Clock::class => autowire(SystemClock::class),
                DeferredTasks::class => autowire(ShutdownTasks::class),
                CurrentUserLoader::class => autowire(PermissionLoader::class),
                ModuleRequirements::class => autowire(AccessRequirements::class),
                ResponseFactoryInterface::class => new ResponseFactory(),
                MailTransport::class => autowire(PhpMailerTransport::class),
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
            ->addDefinitions($definitions)
            ->build();
    }
}
