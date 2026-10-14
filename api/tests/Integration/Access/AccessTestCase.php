<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use DateTimeImmutable;
use Doctrine\DBAL\Exception\TableNotFoundException;
use Psr\Http\Message\ResponseInterface;
use Soltec\Kernel\Auth\JwtService;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Config;
use Soltec\Kernel\DeferredTasks;
use Soltec\Kernel\ImmediateTasks;
use Soltec\Kernel\Mail\MailTransport;
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
use Soltec\Tests\Unit\Kernel\Mail\FakeMailTransport;

/**
 * Base for the tests of the Access module: a migrated database (migrated once, then only data is cleared between
 * tests), a fixed clock and factories that write straight to the database, so a test does not depend on the
 * endpoints it is not testing.
 */
abstract class AccessTestCase extends IntegrationTestCase
{
    protected const PASSWORD = 'correct horse battery staple';

    protected FixedClock $clock;
    protected FakeMailTransport $mail;
    private static ?string $passwordHash = null;

    /** @return array<string, mixed> */
    protected function containerDefinitions(): array
    {
        $this->clock = new FixedClock();
        $this->mail = new FakeMailTransport();

        // Mail is recorded, not sent, and "after the response" work runs at once so a test can assert on it.
        return [
            Clock::class => $this->clock,
            MailTransport::class => $this->mail,
            DeferredTasks::class => new ImmediateTasks(),
        ];
    }

    protected function configWith(array $overrides): Config
    {
        return parent::configWith($overrides + ['APP_URL' => 'https://app.example.test', 'MAIL_FROM_NAME' => 'Acme']);
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
        bool $invitationPending = false,
    ): array {
        $id = Uuid::v7();
        $users = $this->service(UserRepository::class);
        $hash = $invitationPending ? null : $this->passwordHash();
        $users->insert($id, 'internal', $name, $email, $hash, $mustChangePassword, $this->clock->now());
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
     * The token inside the link of the last email sent to an address.
     */
    protected function lastLinkToken(string $to): string
    {
        foreach (array_reverse($this->mail->sent) as $message) {
            if ($message->to === $to) {
                self::assertSame(1, preg_match('/#token=([0-9a-f]{64})/', $message->body, $match));

                return $match[1] ?? self::fail('No token in the email.');
            }
        }

        self::fail('No email was sent to ' . $to);
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

    protected function createDepartment(string $name, bool $active = true): string
    {
        $id = Uuid::v7();
        $this->connection->executeStatement(
            'INSERT INTO departments (id, name, created_at, updated_at, deleted_at) '
            . 'VALUES (UNHEX(:id), :name, NOW(3), NOW(3), :deleted_at)',
            ['id' => Uuid::toHex($id), 'name' => $name, 'deleted_at' => $active ? null : '2026-01-01 00:00:00.000'],
        );

        return $id;
    }

    /** Puts a user in a department and under a manager, straight in the database. */
    protected function placeUser(string $userId, ?string $departmentId, ?string $managerId = null): void
    {
        $this->connection->executeStatement(
            'UPDATE users SET department_id = UNHEX(:department), manager_id = UNHEX(:manager) WHERE id = UNHEX(:id)',
            [
                'id' => Uuid::toHex($userId),
                'department' => $departmentId === null ? null : Uuid::toHex($departmentId),
                'manager' => $managerId === null ? null : Uuid::toHex($managerId),
            ],
        );
    }

    /** A user whose only role gives the listed permissions. */
    protected function tokenWith(string $resource, string ...$permissions): string
    {
        $matrix = [$resource => array_values($permissions)];
        $name = 'Limited ' . $resource . ' ' . bin2hex(random_bytes(3));
        $role = $this->createRole($name, $matrix, [$resource => 'all']);
        $user = $this->createUser('limited-' . bin2hex(random_bytes(3)) . '@example.com', [$role]);

        return $this->tokenFor($user['id']);
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
        $this->applyMigrationAgain('20261009000004');
    }

    /** Runs one migration again, as a half-applied deployment would, or to check that it can be repeated. */
    protected function applyMigrationAgain(string $version): void
    {
        $this->connection->executeStatement('DELETE FROM phinxlog WHERE version = ' . (int) $version);
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
        ) === 77;
    }

    /** Keeps the seeded catalogs and the `admin` role, drops everything the previous test created. */
    private function clearData(): void
    {
        // The hierarchy points users at users: unlink it before deleting them.
        $this->connection->executeStatement('UPDATE users SET manager_id = NULL');
        $tables = [
            'audit_logs', 'account_tokens', 'refresh_tokens', 'devices', 'user_roles', 'contacts', 'users',
            'departments', 'products', 'supplier_contacts', 'supplier_addresses', 'suppliers',
        ];
        foreach ($tables as $table) {
            $this->connection->executeStatement('DELETE FROM ' . $table);
        }
        $custom = 'role_id IN (SELECT id FROM roles WHERE is_system = 0)';
        $this->connection->executeStatement('DELETE FROM role_widgets WHERE ' . $custom);
        $this->connection->executeStatement('DELETE FROM role_permissions WHERE ' . $custom);
        $this->connection->executeStatement('DELETE FROM role_scopes WHERE ' . $custom);
        $this->connection->executeStatement('DELETE FROM roles WHERE is_system = 0');
        $this->resetSettings();
        $this->resetCatalogParameters();
    }

    /** Puts the catalog lists back to what the migrations seed. */
    private function resetCatalogParameters(): void
    {
        $seed = [
            'contact_types' => ['Comercial', 'Compras', 'Facturación'],
            'client_statuses' => [
                'Prospecto aprobado / por activar' => '#0B6BB0',
                'Activo (nuevo)' => '#00796B',
                'Activo (recurrente)' => '#1E7A4C',
                'En riesgo / inactivo temporal' => '#9A5800',
                'Inactivo / dormido' => '#7C8996',
                'Perdido' => '#B3261E',
            ],
            'segments' => [
                'Restaurantes', 'Industria Manufacturera', 'Departamentos/Interiorismo', 'Construcción', 'Finanzas',
                'Educación', 'Servicios', 'Retail',
            ],
            'tax_regimes' => ['Pequeño contribuyente', 'General'],
            'payment_methods' => [],
            'brands' => [],
            'areas' => ['Aire Acondicionado', 'Electricidad', 'Cableado', 'Equipo', 'Otros'],
            'unit_categories' => ['Cantidad', 'Longitud', 'Peso', 'Volumen', 'Superficie'],
        ];
        $units = [
            'Cantidad' => ['Unidad', 'Par', 'Caja', 'Rollo'],
            'Longitud' => ['Metro', 'Centímetro', 'Milímetro', 'Pulgada', 'Pie'],
            'Peso' => ['Kilogramo', 'Gramo', 'Libra', 'Onza'],
            'Volumen' => ['Litro', 'Mililitro', 'Galón'],
            'Superficie' => ['Metro cuadrado'],
        ];
        // Children first: groups point at areas and units at categories.
        $this->connection->executeStatement('DELETE FROM product_groups');
        $this->connection->executeStatement('DELETE FROM units_of_measure');
        foreach ($seed as $table => $values) {
            $this->connection->executeStatement('DELETE FROM ' . $table);
            foreach ($values as $key => $value) {
                $withColor = $table === 'client_statuses';
                $this->connection->executeStatement(
                    'INSERT INTO ' . $table . ' (id, name, ' . ($withColor ? 'color, ' : '')
                    . 'created_at, updated_at) VALUES (UNHEX(:id), :name, ' . ($withColor ? ':color, ' : '')
                    . 'UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))',
                    ['id' => Uuid::toHex(Uuid::v7()), 'name' => $withColor ? $key : $value]
                    + ($withColor ? ['color' => $value] : []),
                );
            }
        }
        foreach ($units as $category => $names) {
            foreach ($names as $name) {
                $this->connection->executeStatement(
                    'INSERT INTO units_of_measure (id, category_id, name, created_at, updated_at) '
                    . 'SELECT UNHEX(:id), c.id, :name, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3) '
                    . 'FROM unit_categories c WHERE c.name = :category',
                    ['id' => Uuid::toHex(Uuid::v7()), 'name' => $name, 'category' => $category],
                );
            }
        }
    }

    /** Puts the single-row settings and the sequences back to what the migration seeds. */
    private function resetSettings(): void
    {
        $this->connection->executeStatement(
            "UPDATE company SET legal_name = '', trade_name = '', tax_id = '', address = NULL, phone = NULL, "
            . "email = NULL, timezone = 'America/Guatemala', logo_path = NULL, version = 1",
        );
        $this->connection->executeStatement(
            "UPDATE financial_settings SET currency_code = 'GTQ', vat_rate = 0.12, income_tax_rate = 0.03, "
            . 'stale_cost_days = 90, quote_validity_days = 15, version = 1',
        );
        $this->connection->executeStatement(
            'UPDATE security_settings SET web_idle_minutes = 30, mobile_refresh_days = 30, max_failed_attempts = 3, '
            . 'lockout_minutes = 15, password_expiry_days = 90, password_min_length = 12, version = 1',
        );
        $this->connection->executeStatement('DELETE FROM margin_levels');
        $levels = [['Margen 33 %', '0.33000', 1], ['Margen 35 %', '0.35000', 0]];
        foreach ($levels as [$name, $rate, $default]) {
            $this->connection->executeStatement(
                'INSERT INTO margin_levels (id, name, rate, is_default, created_at, updated_at) '
                . 'VALUES (UNHEX(:id), :name, :rate, :is_default, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))',
                [
                    'id' => Uuid::toHex(Uuid::v7()),
                    'name' => $name,
                    'rate' => $rate,
                    'is_default' => $default,
                ],
            );
        }
        $seeded = ['client' => ['CLI', 'none'], 'supplier' => ['PRV', 'none'], 'quote' => ['COT', 'month'],
            'project' => ['PRY', 'month'], 'purchase_order' => ['OC', 'month'], 'contact' => ['CON', 'none'],
            'product' => ['PRD', 'none']];
        foreach ($seeded as $code => [$prefix, $period]) {
            $this->connection->executeStatement(
                'UPDATE sequences SET prefix = :prefix, padding = 4, period = :period, period_key = NULL, '
                . 'next_value = 1, version = 1 WHERE code = :code',
                ['code' => $code, 'prefix' => $prefix, 'period' => $period],
            );
        }
    }
}
