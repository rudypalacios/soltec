<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Products;

use Soltec\Tests\Integration\Access\AccessTestCase;

/** Shared setup of the product tests: an administrator and the supplier, group, unit and brand a product needs. */
abstract class ProductsTestCase extends AccessTestCase
{
    protected const GONE = '0192a1b2-0000-7000-8000-000000000000';

    protected string $adminToken;
    protected string $adminId;
    protected string $supplierId;
    protected string $groupId;
    protected string $unitId;
    protected string $brandId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminId = $this->createAdmin()['id'];
        $this->adminToken = $this->tokenFor($this->adminId);
        $this->supplierId = $this->makeSupplier('Cables del Sur');
        $areaId = $this->text($this->firstOf('/areas'), 'id');
        $this->groupId = $this->makeParameter('/product-groups', ['name' => 'Conectores', 'area_id' => $areaId]);
        $this->unitId = $this->text($this->firstOf('/units-of-measure'), 'id');
        $this->brandId = $this->makeParameter('/brands', ['name' => 'Panduit']);
    }

    /** Moves the clock and signs in again: an access token lasts minutes, and a test jumps over days. */
    protected function advance(string $interval): void
    {
        $this->clock->advance($interval);
        $this->adminToken = $this->tokenFor($this->adminId);
    }

    /** @return array<array-key, mixed> */
    protected function firstOf(string $path): array
    {
        return $this->rowsAt($this->json($this->api('GET', $path, $this->adminToken)), 'data')[0];
    }

    /** @param array<string, mixed> $body */
    protected function makeParameter(string $path, array $body): string
    {
        $response = $this->api('POST', $path, $this->adminToken, $body);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return $this->text($this->json($response), 'id');
    }

    protected function makeSupplier(string $name): string
    {
        $response = $this->api('POST', '/suppliers', $this->adminToken, [
            'name' => $name, 'identification_type' => 'none',
        ]);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return $this->text($this->json($response), 'id');
    }

    /**
     * @param array<string, mixed> $extra
     * @return array<array-key, mixed>
     */
    protected function makeProduct(string $name, string $cost = '22.96', array $extra = []): array
    {
        $body = $extra + [
            'name' => $name,
            'supplier_id' => $this->supplierId,
            'group_id' => $this->groupId,
            'unit_id' => $this->unitId,
            'cost' => $cost,
        ];
        $response = $this->api('POST', '/products', $this->adminToken, $body);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return $this->json($response);
    }

    /** @return array<array-key, mixed> */
    protected function product(string $id, string $query = ''): array
    {
        return $this->json($this->api('GET', '/products/' . $id . $query, $this->adminToken));
    }

    /** @param array<string, mixed>|null $body */
    protected function statusOf(string $method, string $path, ?string $token = null, ?array $body = null): int
    {
        return $this->api($method, $path, $token ?? $this->adminToken, $body)->getStatusCode();
    }

    /**
     * The body of an edit that keeps what the product has, with the changes on top.
     *
     * @param array<array-key, mixed> $product
     * @param array<string, mixed> $changes
     * @return array<string, mixed>
     */
    protected function editBody(array $product, array $changes = []): array
    {
        return $changes + [
            'version' => $product['version'],
            'name' => $product['name'],
            'supplier_id' => $this->text($product, 'supplier', 'id'),
            'group_id' => $this->text($product, 'group', 'id'),
            'unit_id' => $this->text($product, 'unit', 'id'),
            'cost' => $product['cost'],
        ];
    }
}
