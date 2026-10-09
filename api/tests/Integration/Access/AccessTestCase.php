<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use DateTimeImmutable;
use Doctrine\DBAL\Exception\TableNotFoundException;
use Psr\Http\Message\ResponseInterface;
use Soltec\Kernel\Auth\JwtService;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Db\ConnectionFactory;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Deploy\MigrationRunner;
use Soltec\Kernel\Paths;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Domain\PasswordHasher;
use Soltec\Modules\Access\Persistence\RoleRepository;
use Soltec\Modules\Access\Persistence\SessionRepository;
use Soltec\Modules\Access\Persistence\UserRepository;
use Soltec\Tests\Integration\IntegrationTestCase;
use Soltec\Tests\Support\FixedClock;

/**
 * Base for the tests of the Access module: a migrated database (migrated once, then only data is cleared between
 * tests), a fixed clock and factories that write straight to the database, so a test does not depend on the
 * endpoints it is not testing.
 */
abstract class AccessTestCase extends IntegrationTestCase
{
    protected const PASSWORD = 'correct horse battery staple';

    protected FixedClock $clock;
    private static ?string $passwordHash = null;

    /** @return array<string, mixed> */
    protected function containerDefinitions(): array
    {
        $this->clock = new FixedClock();

        return [Clock::class => $this->clock];
    }

    protected function prepareDatabase(): void
    {
        $this->connection = ConnectionFactory::create($this->config);
        if ($this->schemaIsCurrent()) {
            $this->clearData();

            return;
        }

        $this->resetDatabase();
        (new MigrationRunner($this->connection, new Paths(dirname(__DIR__, 3)), $this->config))->apply();
    }

    /** @param array<string, mixed>|null $body */
    protected function api(string $method, string $path, ?string $token = null, ?array $body = null): ResponseInterface
    {
        $headers = [];
        if ($token !== null) {
            $headers['Authorization'] = 'Bearer ' . $token;
        }
        if ($body !== null) {
            $headers['Content-Type'] = 'application/json';
        }

        return $this->call(
            $method,
            '/api/v1' . $path,
            $headers,
            $body === null ? null : json_encode($body, JSON_THROW_ON_ERROR),
        );
    }

    /**
     * @param list<string> $roleIds
     * @return array{id: string, email: string}
     */
    protected function createUser(
        string $email,
        array $roleIds = [],
        bool $mustChangePassword = false,
        ?DateTimeImmutable $passwordChangedAt = null,
        string $name = 'Test User',
    ): array {
        $id = Uuid::v7();
        $users = $this->service(UserRepository::class);
        $users->insert($id, 'internal', $name, $email, $this->passwordHash(), $mustChangePassword, $this->clock->now());
        $users->replaceRoles($id, $roleIds);
        if ($passwordChangedAt !== null) {
            $this->connection->executeStatement(
                'UPDATE users SET password_changed_at = :at WHERE id = UNHEX(:id)',
                ['at' => $passwordChangedAt->format('Y-m-d H:i:s.v'), 'id' => Uuid::toHex($id)],
            );
        }

        return ['id' => $id, 'email' => $email];
    }

    /**
     * @param array<string, list<string>> $permissions
     * @param array<string, string> $scopes
     */
    protected function createRole(string $name, array $permissions = [], array $scopes = []): string
    {
        $id = Uuid::v7();
        $roles = $this->service(RoleRepository::class);
        $roles->insert($id, $name, null, 'internal', $this->clock->now());
        $roles->replaceMatrix($id, $permissions, $scopes);

        return $id;
    }

    protected function adminRoleId(): string
    {
        return $this->service(RoleRepository::class)->findIdByCode('admin') ?? self::fail('The admin role is missing.');
    }

    /** @return array{id: string, email: string} */
    protected function createAdmin(string $email = 'admin@example.com'): array
    {
        return $this->createUser($email, [$this->adminRoleId()], name: 'Admin');
    }

    /** A valid access token for a new web device of the user, as if they had just signed in. */
    protected function tokenFor(string $userId, bool $restricted = false): string
    {
        return $this->sessionFor($userId, $restricted)['token'];
    }

    /** @return array{token: string, deviceId: string} */
    protected function sessionFor(string $userId, bool $restricted = false): array
    {
        $deviceId = $this->service(SessionRepository::class)->createDevice($userId, 'web', null, $this->clock->now());

        return [
            'token' => $this->service(JwtService::class)->issue($userId, $deviceId, $restricted),
            'deviceId' => $deviceId,
        ];
    }

    /**
     * @param array<string, mixed> $body
     * @return ResponseInterface
     */
    protected function login(string $email, string $password = self::PASSWORD, array $body = []): ResponseInterface
    {
        return $this->api('POST', '/auth/login', null, $body + [
            'email' => $email,
            'password' => $password,
            'device' => ['platform' => 'web', 'name' => 'Test browser'],
        ]);
    }

    /**
     * The audit entries of an entity type (optionally one entity), oldest first, with the JSON already decoded.
     *
     * @return list<array{
     *     action: string, entityId: string|null, userId: string|null,
     *     before: array<array-key, mixed>|null, after: array<array-key, mixed>|null
     * }>
     */
    protected function auditEntries(string $entityType, ?string $entityId = null): array
    {
        $sql = 'SELECT action, LOWER(HEX(entity_id)) AS entity_id, before_data, after_data, '
            . 'LOWER(HEX(user_id)) AS user_id FROM audit_logs WHERE entity_type = :type';
        $params = ['type' => $entityType];
        if ($entityId !== null) {
            $sql .= ' AND entity_id = UNHEX(:id)';
            $params['id'] = Uuid::toHex($entityId);
        }

        $entries = [];
        foreach ($this->connection->fetchAllAssociative($sql . ' ORDER BY occurred_at, id', $params) as $row) {
            $entries[] = [
                'action' => Row::string($row, 'action'),
                'entityId' => Row::nullableString($row, 'entity_id') === null
                    ? null
                    : Uuid::fromHex(Row::string($row, 'entity_id')),
                'userId' => Row::nullableString($row, 'user_id') === null
                    ? null
                    : Uuid::fromHex(Row::string($row, 'user_id')),
                'before' => $this->decodeJson(Row::nullableString($row, 'before_data')),
                'after' => $this->decodeJson(Row::nullableString($row, 'after_data')),
            ];
        }

        return $entries;
    }

    /** @return array<array-key, mixed>|null */
    private function decodeJson(?string $json): ?array
    {
        if ($json === null) {
            return null;
        }
        $decoded = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($decoded);

        return $decoded;
    }

    /**
     * @template T of object
     * @param class-string<T> $class
     * @return T
     */
    protected function service(string $class): object
    {
        $container = $this->app->getContainer();
        self::assertNotNull($container);
        $service = $container->get($class);
        self::assertInstanceOf($class, $service);

        return $service;
    }

    /** Reads the cookie a response sets, or null. */
    protected function setCookie(ResponseInterface $response): ?string
    {
        $headers = $response->getHeader('Set-Cookie');

        return $headers[0] ?? null;
    }

    /** The value of the refresh cookie a response sets. */
    protected function refreshCookieValue(ResponseInterface $response): string
    {
        $cookie = $this->setCookie($response);
        self::assertNotNull($cookie, 'The response sets no cookie.');
        self::assertSame(1, preg_match('/^refresh_token=([0-9a-f]{64});/', $cookie, $match));

        return $match[1] ?? self::fail('No refresh token in the cookie.');
    }

    /** Runs the seed migration a second time, as a half-applied deployment would. */
    protected function applySeedAgain(): void
    {
        $this->connection->executeStatement('DELETE FROM phinxlog WHERE version = 20261009000004');
        $applied = (new MigrationRunner($this->connection, new Paths(dirname(__DIR__, 3)), $this->config))->apply();
        self::assertCount(1, $applied);
    }

    private function passwordHash(): string
    {
        return self::$passwordHash ??= (new PasswordHasher())->hash(self::PASSWORD);
    }

    private function schemaIsCurrent(): bool
    {
        $expected = count(glob(dirname(__DIR__, 4) . '/db/migrations/*.php') ?: []);
        try {
            $applied = $this->connection->fetchOne('SELECT COUNT(*) FROM phinxlog');
        } catch (TableNotFoundException) {
            return false;
        }

        if (!is_numeric($applied) || (int) $applied !== $expected) {
            return false;
        }

        // A run that stopped while the seed was missing must not poison the ones that follow.
        return $this->countRows(
            "SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.code = 'admin'",
        ) === 8;
    }

    /** Keeps the seeded catalogs and the `admin` role, drops everything the previous test created. */
    private function clearData(): void
    {
        foreach (['audit_logs', 'refresh_tokens', 'devices', 'user_roles', 'users'] as $table) {
            $this->connection->executeStatement('DELETE FROM ' . $table);
        }
        $custom = 'role_id IN (SELECT id FROM roles WHERE is_system = 0)';
        $this->connection->executeStatement('DELETE FROM role_permissions WHERE ' . $custom);
        $this->connection->executeStatement('DELETE FROM role_scopes WHERE ' . $custom);
        $this->connection->executeStatement('DELETE FROM roles WHERE is_system = 0');
    }
}
