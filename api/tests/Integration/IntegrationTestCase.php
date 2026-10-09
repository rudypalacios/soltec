<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration;

use Doctrine\DBAL\Connection;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use Psr\Http\Message\ResponseInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;
use Soltec\Kernel\Bootstrap;
use Soltec\Kernel\Config;
use Soltec\Kernel\Db\ConnectionFactory;
use Soltec\Kernel\Http\DeployTokenMiddleware;

/**
 * Base for tests that need a real MySQL database. Every table is dropped before each test, so the
 * database name must end in "_test" or the test refuses to run.
 */
abstract class IntegrationTestCase extends TestCase
{
    protected const DEPLOY_TOKEN = 'integration-deploy-token-with-more-than-32-chars';
    protected const JWT_SECRET = 'integration-jwt-secret-with-more-than-32-chars';

    protected Config $config;
    protected Connection $connection;
    /** @var App<ContainerInterface|null> */
    protected App $app;

    protected function setUp(): void
    {
        $this->config = $this->configWith([]);
        $this->prepareDatabase();
        $this->app = Bootstrap::createApp(dirname(__DIR__, 2), $this->config, $this->containerDefinitions());
    }

    /**
     * Container entries that replace the defaults, such as a fixed clock.
     *
     * @return array<string, mixed>
     */
    protected function containerDefinitions(): array
    {
        return [];
    }

    /** Leaves an empty database; subclasses that need a schema override it. */
    protected function prepareDatabase(): void
    {
        $this->resetDatabase();
    }

    /** @param array<string, string> $overrides */
    protected function configWith(array $overrides): Config
    {
        $values = ['APP_ENV' => 'testing', 'DEPLOY_TOKEN' => self::DEPLOY_TOKEN, 'JWT_SECRET' => self::JWT_SECRET];
        foreach (['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS'] as $key) {
            $value = getenv($key);
            if ($value !== false) {
                $values[$key] = $value;
            }
        }

        return new Config($overrides + $values);
    }

    /**
     * @param array<string, string> $headers
     * @param array<string, string> $cookies
     */
    protected function call(
        string $method,
        string $uri,
        array $headers = [],
        ?string $body = null,
        array $cookies = [],
    ): ResponseInterface {
        $request = (new ServerRequestFactory())->createServerRequest($method, $uri)->withCookieParams($cookies);
        if ($body !== null) {
            $request->getBody()->write($body);
        }
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        return $this->app->handle($request);
    }

    /** @return array<string, mixed> */
    protected function json(ResponseInterface $response): array
    {
        $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($body);

        /** @var array<string, mixed> $body */
        return $body;
    }

    /**
     * A string inside a decoded JSON body; the test fails when it is missing or not a string.
     *
     * @param array<array-key, mixed> $data
     */
    protected function text(array $data, string ...$keys): string
    {
        $value = $this->valueAt($data, ...$keys);
        self::assertIsString($value, 'Not a string at ' . implode('.', $keys));

        return $value;
    }

    /**
     * The rows of a list inside a decoded JSON body.
     *
     * @param array<array-key, mixed> $data
     * @return list<array<string, mixed>>
     */
    protected function rowsAt(array $data, string ...$keys): array
    {
        $value = $this->valueAt($data, ...$keys);
        self::assertIsArray($value, 'Not a list at ' . implode('.', $keys));

        $rows = [];
        foreach ($value as $row) {
            self::assertIsArray($row);
            /** @var array<string, mixed> $row */
            $rows[] = $row;
        }

        return $rows;
    }

    /**
     * One column of the rows of a list, as strings.
     *
     * @param array<array-key, mixed> $data
     * @return list<string>
     */
    protected function columnAt(array $data, string $column, string ...$keys): array
    {
        return array_map(
            fn (array $row): string => $this->text($row, $column),
            $this->rowsAt($data, ...$keys),
        );
    }

    /**
     * The `errors` of a validation problem as field => code.
     *
     * @return array<string, string>
     */
    protected function errorCodes(ResponseInterface $response): array
    {
        $codes = [];
        foreach ($this->rowsAt($this->json($response), 'errors') as $error) {
            $codes[$this->text($error, 'field')] = $this->text($error, 'code');
        }

        return $codes;
    }

    /** @param array<string, mixed> $params */
    protected function countRows(string $sql, array $params = []): int
    {
        $value = $this->connection->fetchOne($sql, $params);
        self::assertTrue(is_int($value) || is_string($value), 'The query did not return a number.');

        return (int) $value;
    }

    /**
     * Reads a nested value of a decoded JSON body, or null when any step is missing.
     *
     * @param array<array-key, mixed> $data
     */
    protected function valueAt(array $data, string ...$keys): mixed
    {
        $current = $data;
        foreach ($keys as $key) {
            if (!is_array($current) || !array_key_exists($key, $current)) {
                return null;
            }
            $current = $current[$key];
        }

        return $current;
    }

    /** @return array<string, string> */
    protected function deployHeaders(): array
    {
        return [DeployTokenMiddleware::HEADER => self::DEPLOY_TOKEN];
    }

    protected function resetDatabase(): void
    {
        $database = $this->config->string('DB_NAME');
        if (!str_ends_with($database, '_test')) {
            self::fail(sprintf('Refusing to reset "%s": the test database name must end in "_test".', $database));
        }

        $this->connection = ConnectionFactory::create($this->config);
        $this->connection->executeStatement('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($this->connection->fetchFirstColumn('SHOW TABLES') as $table) {
            self::assertIsString($table);
            $this->connection->executeStatement(sprintf('DROP TABLE `%s`', $table));
        }
        $this->connection->executeStatement('SET FOREIGN_KEY_CHECKS = 1');
    }
}
