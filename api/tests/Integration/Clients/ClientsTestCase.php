<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Clients;

use Psr\Http\Message\ResponseInterface;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Persistence\RoleRepository;
use Soltec\Modules\Access\Persistence\UserRepository;
use Soltec\Tests\Integration\Access\AccessTestCase;

/** Shared setup of the client tests: an administrator, advisers with limited roles and quick ways to build data. */
abstract class ClientsTestCase extends AccessTestCase
{
    protected string $adminToken;
    protected string $adminId;

    protected function setUp(): void
    {
        parent::setUp();
        $admin = $this->createAdmin();
        $this->adminId = $admin['id'];
        $this->adminToken = $this->tokenFor($admin['id']);
    }

    /**
     * An internal user whose role gives access to clients and contacts. `$scope` is the data scope of both.
     *
     * @return array{id: string, token: string}
     */
    protected function seller(
        string $email,
        bool $view = true,
        bool $create = false,
        bool $edit = false,
        bool $deactivate = false,
        string $scope = 'own',
        bool $contacts = true,
    ): array {
        $clients = array_values(array_filter([
            $view || $create || $edit || $deactivate ? 'view' : null,
            $create ? 'create' : null,
            $edit || $create ? 'edit' : null,
            $deactivate ? 'deactivate' : null,
        ]));
        $matrix = ['clients' => $clients];
        $scopes = ['clients' => $scope];
        if ($contacts) {
            $matrix['contacts'] = ['create', 'edit', 'view'];
            $scopes['contacts'] = $scope;
        }
        $role = $this->createRole('Vendedor ' . $email, $matrix, $scopes);
        $user = $this->createUser($email, [$role], name: ucfirst(strstr($email, '@', true) ?: $email));

        return ['id' => $user['id'], 'token' => $this->tokenFor($user['id'])];
    }

    /**
     * An external user of a client, with the single resource a portal account holds.
     *
     * @return array{id: string, token: string}
     */
    protected function externalUser(string $email, string $clientId): array
    {
        $roleId = Uuid::v7();
        $roles = $this->service(RoleRepository::class);
        $roles->insert($roleId, 'Portal ' . $email, null, 'external', $this->clock->now());
        $roles->replaceMatrix($roleId, ['client_profile' => ['view']], []);

        $userId = Uuid::v7();
        $users = $this->service(UserRepository::class);
        $users->insert($userId, 'external', 'Externo', $email, null, false, $this->clock->now());
        $users->replaceRoles($userId, [$roleId]);
        $this->connection->executeStatement(
            'UPDATE users SET client_id = UNHEX(:client) WHERE id = UNHEX(:id)',
            ['client' => Uuid::toHex($clientId), 'id' => Uuid::toHex($userId)],
        );

        return ['id' => $userId, 'token' => $this->tokenFor($userId)];
    }

    /**
     * @param array<string, mixed> $extra
     * @return array<string, mixed>
     */
    protected function createClient(string $name, array $extra = [], ?string $token = null): array
    {
        $response = $this->api('POST', '/clients', $token ?? $this->adminToken, ['name' => $name] + $extra);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return $this->json($response);
    }

    /**
     * A customer created and converted by the administrator.
     *
     * @param array<string, mixed> $extra
     * @return array<string, mixed>
     */
    protected function customer(string $name, array $extra = [], ?string $token = null): array
    {
        $prospect = $this->createClient($name, $extra, $token);
        $response = $this->api('POST', '/clients/' . $this->text($prospect, 'id') . '/convert', $this->adminToken, [
            'version' => $prospect['version'],
            'identification_type' => 'none',
            'billing_profile' => $this->billingProfile(['legal_name' => $name . ', S.A.']),
        ]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());

        return $this->json($response);
    }

    /**
     * @param array<string, mixed> $override
     * @return array<string, mixed>
     */
    protected function billingProfile(array $override = []): array
    {
        return $override + ['legal_name' => 'Por convertir, S.A.', 'tax_regime_id' => $this->taxRegimeId()];
    }

    protected function createContact(string $token, string $name): string
    {
        $response = $this->api('POST', '/contacts', $token, ['name' => $name]);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return $this->text($this->json($response), 'id');
    }

    protected function segmentId(string $name): string
    {
        return $this->catalogId('segments', $name);
    }

    protected function taxRegimeId(): string
    {
        return $this->catalogId('tax_regimes', 'General');
    }

    protected function contactTypeId(string $name = 'Comercial'): string
    {
        return $this->catalogId('contact_types', $name);
    }

    protected function catalogId(string $table, string $name): string
    {
        $id = $this->connection->fetchOne(
            sprintf('SELECT LOWER(HEX(id)) FROM %s WHERE name = :name', $table),
            ['name' => $name],
        );
        self::assertIsString($id, 'No such value ' . $name);

        return Uuid::fromHex($id);
    }

    protected function clientName(string $id): string
    {
        $name = $this->connection->fetchOne(
            'SELECT name FROM clients WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($id)],
        );
        self::assertIsString($name);

        return $name;
    }

    /**
     * The names of the clients a user's list shows.
     *
     * @return list<string>
     */
    protected function clientNames(string $token, string $query = ''): array
    {
        $response = $this->api('GET', '/clients?per_page=100' . $query, $token);
        self::assertSame(200, $response->getStatusCode());

        return $this->columnAt($this->json($response), 'name', 'data');
    }

    /** Links a person to a client with the given roles (contact type ids), as the given user. */
    protected function link(
        string $token,
        string $clientId,
        string $contactId,
        string ...$typeIds,
    ): ResponseInterface {
        return $this->api('PUT', '/clients/' . $clientId . '/contacts/' . $contactId, $token, [
            'contact_type_ids' => array_values($typeIds),
        ]);
    }

    /** How many clients a user is an adviser of. */
    protected function sellerRows(string $userId): int
    {
        return $this->countRows(
            'SELECT COUNT(*) FROM client_sellers WHERE user_id = UNHEX(:id)',
            ['id' => Uuid::toHex($userId)],
        );
    }

    protected function contactOwner(string $contactId): string
    {
        $owner = $this->connection->fetchOne(
            'SELECT LOWER(HEX(owner_id)) FROM contacts WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($contactId)],
        );
        self::assertIsString($owner);

        return Uuid::fromHex($owner);
    }
}
