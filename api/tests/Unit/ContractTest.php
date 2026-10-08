<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Soltec\Kernel\Bootstrap;
use Soltec\Kernel\Config;
use Symfony\Component\Yaml\Yaml;

/** Keeps the route table and contract/openapi.yaml in step: no undocumented route, no ghost path. */
final class ContractTest extends TestCase
{
    private const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

    public function testEveryVersionedRouteIsDescribedInTheContractAndViceVersa(): void
    {
        self::assertEqualsCanonicalizing($this->contractOperations(), $this->versionedRoutes());
    }

    /** @return list<string> operations such as "GET /v1/health" */
    private function versionedRoutes(): array
    {
        $app = Bootstrap::createApp(dirname(__DIR__, 2), new Config(['APP_ENV' => 'testing']));

        $operations = [];
        foreach ($app->getRouteCollector()->getRoutes() as $route) {
            if (!str_starts_with($route->getPattern(), '/v1/')) {
                continue;
            }
            foreach ($route->getMethods() as $method) {
                $operations[] = sprintf('%s %s', $method, $route->getPattern());
            }
        }

        return $operations;
    }

    /** @return list<string> */
    private function contractOperations(): array
    {
        $contract = Yaml::parseFile(dirname(__DIR__, 3) . '/contract/openapi.yaml');
        self::assertIsArray($contract);
        self::assertIsArray($contract['paths']);

        $operations = [];
        foreach ($contract['paths'] as $path => $item) {
            self::assertIsString($path);
            self::assertIsArray($item);
            foreach (array_keys($item) as $method) {
                if (in_array($method, self::HTTP_METHODS, true)) {
                    $operations[] = sprintf('%s %s', strtoupper((string) $method), $path);
                }
            }
        }

        return $operations;
    }
}
