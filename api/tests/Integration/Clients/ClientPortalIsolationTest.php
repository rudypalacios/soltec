<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Clients;

use Soltec\Kernel\Uuid;

/** What an external user can reach: their own client, reduced, and nothing of the company's portfolio (ADR-0025). */
final class ClientPortalIsolationTest extends ClientsTestCase
{
    public function testAnExternalUserSeesOnlyTheReducedProfileOfTheirOwnClient(): void
    {
        $seller = $this->seller('ana@example.com', create: true);
        $client = $this->customer('Mi Empresa', [
            'identification_type' => 'nit',
            'identification' => '6647912-6',
            'status_id' => $this->catalogId('client_statuses', 'Perdido'),
            'segment_id' => $this->segmentId('Retail'),
            'area_id' => $this->catalogId('areas', 'Electricidad'),
            'addresses' => [['label' => 'Oficina', 'address' => 'Calle 1']],
        ], $seller['token']);
        // Customer conversion above used no identification; set the one this test needs.
        $this->connection->executeStatement(
            "UPDATE clients SET identification_type = 'nit', identification = '66479126' WHERE name = 'Mi Empresa'",
        );
        $person = $this->createContact($seller['token'], 'Contacto interno');
        $this->api('PUT', '/clients/' . $this->text($client, 'id') . '/contacts/' . $person, $seller['token'], [
            'contact_type_ids' => [$this->contactTypeId()],
        ]);
        $portal = $this->externalUser('portal@example.com', $this->text($client, 'id'));

        $response = $this->api('GET', '/me/client', $portal['token']);

        self::assertSame(200, $response->getStatusCode());
        $profile = $this->json($response);
        // The exact set of keys: nothing else can leak without this test failing.
        self::assertSame(
            ['addresses', 'id', 'identification', 'identification_type', 'legal_name', 'name', 'tax_regime'],
            $this->sortedKeys($profile),
        );
        self::assertSame('Mi Empresa', $profile['name']);
        self::assertSame('Mi Empresa, S.A.', $profile['legal_name']);
        self::assertSame('6647912-6', $profile['identification']);
        self::assertSame('General', $this->valueAt($profile, 'tax_regime', 'name'));
        self::assertSame('Calle 1', $this->valueAt($profile, 'addresses', '0', 'address'));
        $text = json_encode($profile, JSON_THROW_ON_ERROR);
        foreach (['Perdido', 'Retail', 'Electricidad', 'Ana', 'Contacto interno', 'CLI-'] as $internal) {
            self::assertStringNotContainsString($internal, $text);
        }
    }

    public function testEachExternalUserSeesOnlyTheirClientAndTheIdCannotBeChosen(): void
    {
        $first = $this->text($this->customer('Primera Empresa'), 'id');
        $second = $this->text($this->customer('Segunda Empresa'), 'id');
        $one = $this->externalUser('uno@example.com', $first);
        $two = $this->externalUser('dos@example.com', $second);

        self::assertSame('Primera Empresa', $this->json($this->api('GET', '/me/client', $one['token']))['name']);
        self::assertSame('Segunda Empresa', $this->json($this->api('GET', '/me/client', $two['token']))['name']);
        // There is no route with an id, and the query string is not read.
        self::assertSame(404, $this->api('GET', '/me/client/' . $second, $one['token'])->getStatusCode());
        $own = $this->api('GET', '/me/client?client_id=' . $second, $one['token']);
        self::assertSame('Primera Empresa', $this->json($own)['name']);
    }

    public function testAnExternalUserReachesNothingOfTheCompanyPortfolio(): void
    {
        $client = $this->text($this->customer('Mi Empresa'), 'id');
        $other = $this->text($this->customer('Otra Empresa'), 'id');
        $portal = $this->externalUser('portal@example.com', $client);
        $token = $portal['token'];

        foreach (
            [
            ['GET', '/clients', null],
            ['GET', '/clients/' . $client, null],
            ['GET', '/clients/' . $other, null],
            ['POST', '/clients', ['name' => 'X']],
            ['PATCH', '/clients/' . $client, ['version' => 1, 'name' => 'X']],
            ['GET', '/clients/similar?name=Empresa', null],
            ['GET', '/clients/seller-options', null],
            ['GET', '/segments/options', null],
            ['GET', '/client-statuses/options', null],
            ['GET', '/tax-regimes/options', null],
            ['GET', '/contacts', null],
            ['GET', '/suppliers/options', null],
            ['GET', '/margin-levels/options', null],
            ] as [$method, $path, $body]
        ) {
            self::assertSame(403, $this->api($method, $path, $token, $body)->getStatusCode(), $method . ' ' . $path);
        }
    }

    public function testInternalUsersHaveNoClientProfile(): void
    {
        $seller = $this->seller('ana@example.com', create: true);

        self::assertSame(403, $this->api('GET', '/me/client', $seller['token'])->getStatusCode());
        self::assertSame(403, $this->api('GET', '/me/client', $this->adminToken)->getStatusCode());
        self::assertSame(401, $this->api('GET', '/me/client')->getStatusCode());
    }

    public function testAnExternalAccountWithoutAnActiveClientHasNoProfile(): void
    {
        $client = $this->text($this->customer('Mi Empresa'), 'id');
        $portal = $this->externalUser('portal@example.com', $client);
        $loose = $this->externalUser('suelto@example.com', $client);
        $this->connection->executeStatement(
            'UPDATE users SET client_id = NULL WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($loose['id'])],
        );

        self::assertSame(404, $this->api('GET', '/me/client', $loose['token'])->getStatusCode());
        $this->api('POST', '/clients/' . $client . '/deactivate', $this->adminToken);
        self::assertSame(404, $this->api('GET', '/me/client', $portal['token'])->getStatusCode());
    }

    public function testTheProfileResourceBelongsToExternalRolesOnly(): void
    {
        $resources = $this->json($this->api('GET', '/resources', $this->adminToken));
        self::assertNotContains('client_profile', $this->columnAt($resources, 'code', 'data'));
        self::assertContains('clients', $this->columnAt($resources, 'code', 'data'));

        $role = $this->api('POST', '/roles', $this->adminToken, [
            'name' => 'Intento',
            'user_type' => 'internal',
            'permissions' => ['client_profile' => ['view']],
            'scopes' => [],
        ]);
        self::assertSame(['permissions.client_profile' => 'not_found'], $this->errorCodes($role));
        self::assertSame(0, $this->countRows(
            'SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id '
            . "WHERE rp.resource_code = 'client_profile'"
            . " AND r.user_type = 'internal'",
        ));
    }

    public function testAnAccountCannotPointAtAClientThatDoesNotExist(): void
    {
        $user = $this->createUser('x@example.com');

        $this->expectException(\Doctrine\DBAL\Exception\ForeignKeyConstraintViolationException::class);
        $this->connection->executeStatement(
            'UPDATE users SET client_id = UNHEX(:client) WHERE id = UNHEX(:id)',
            ['client' => Uuid::toHex('0192a1b2-0000-7000-8000-000000000000'), 'id' => Uuid::toHex($user['id'])],
        );
    }

    /**
     * @param array<string, mixed> $data
     * @return list<string>
     */
    private function sortedKeys(array $data): array
    {
        $keys = array_map('strval', array_keys($data));
        sort($keys);

        return $keys;
    }
}
