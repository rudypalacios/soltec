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
        self::assertEqualsCanonicalizing($this->contractOperations(planned: false), $this->versionedRoutes());
    }

    public function testNoRouteIsHiddenBehindAPlannedFlag(): void
    {
        $implementedAndPlanned = array_intersect($this->contractOperations(planned: true), $this->versionedRoutes());

        self::assertSame(
            [],
            array_values($implementedAndPlanned),
            'Remove x-planned from operations that have a route.',
        );
    }

    public function testEveryOperationDeclaresItsAccessRule(): void
    {
        $missing = [];
        foreach ($this->contractPaths() as $path => $item) {
            foreach ($item as $method => $operation) {
                if (!in_array($method, self::HTTP_METHODS, true)) {
                    continue;
                }
                self::assertIsArray($operation);
                $rule = $operation['x-permission'] ?? null;
                if (!is_string($rule) || !preg_match('/^(public|authenticated|[a-z_]+\.[a-z_]+)$/', $rule)) {
                    $missing[] = sprintf('%s %s', strtoupper((string) $method), $path);
                }
            }
        }

        self::assertSame([], $missing, 'Operations without a valid x-permission.');
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

    /**
     * @param bool $planned true lists only operations flagged x-planned (specified, no route yet); false lists the rest
     * @return list<string>
     */
    private function contractOperations(bool $planned): array
    {
        $operations = [];
        foreach ($this->contractPaths() as $path => $item) {
            foreach ($item as $method => $operation) {
                if (!in_array($method, self::HTTP_METHODS, true)) {
                    continue;
                }
                self::assertIsArray($operation);
                if (($operation['x-planned'] ?? false) === $planned) {
                    $operations[] = sprintf('%s %s', strtoupper((string) $method), $path);
                }
            }
        }

        return $operations;
    }

    /** @return array<string, array<mixed>> */
    private function contractPaths(): array
    {
        $contract = Yaml::parseFile(dirname(__DIR__, 3) . '/contract/openapi.yaml');
        self::assertIsArray($contract);
        self::assertIsArray($contract['paths']);

        $paths = [];
        foreach ($contract['paths'] as $path => $item) {
            self::assertIsString($path);
            self::assertIsArray($item);
            $paths[$path] = $item;
        }

        return $paths;
    }
}
