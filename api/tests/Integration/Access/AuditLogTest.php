<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Soltec\Kernel\Uuid;

/** Reading the audit log: newest first, filtered, paged by cursor, scoped, and never writable. */
final class AuditLogTest extends AccessTestCase
{
    private const T0 = '2026-10-01 10:00:00.000';

    private string $adminToken = '';
    private string $adminId = '';

    protected function setUp(): void
    {
        parent::setUp();
        $admin = $this->createAdmin();
        $this->adminId = $admin['id'];
        $this->adminToken = $this->tokenFor($admin['id']);
    }

    /** Writes an entry straight into the table, so the test controls its moment and actor. */
    private function entry(
        string $at,
        ?string $userId,
        string $action,
        string $entityType = 'users',
        ?string $entityId = null,
        ?string $before = null,
        ?string $after = null,
    ): string {
        $id = Uuid::v7();
        $this->connection->executeStatement(
            'INSERT INTO audit_logs (id, occurred_at, user_id, action, entity_type, entity_id, before_data, '
            . 'after_data, ip_address) VALUES (UNHEX(:id), :at, UNHEX(:user), :action, :type, UNHEX(:entity), '
            . ':before, :after, INET6_ATON(:ip))',
            [
                'id' => Uuid::toHex($id),
                'at' => $at,
                'user' => $userId === null ? null : Uuid::toHex($userId),
                'action' => $action,
                'type' => $entityType,
                'entity' => $entityId === null ? null : Uuid::toHex($entityId),
                'before' => $before,
                'after' => $after,
                'ip' => '203.0.113.9',
            ],
        );

        return $id;
    }

    /**
     * @param array<string, string|int> $query
     * @return array<string, mixed>
     */
    private function read(array $query = [], ?string $token = null): array
    {
        $path = '/audit-logs' . ($query === [] ? '' : '?' . http_build_query($query));
        $response = $this->api('GET', $path, $token ?? $this->adminToken);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());

        return $this->json($response);
    }

    /**
     * @param array<string, string|int> $query
     * @return list<string> the actions in the order returned
     */
    private function actions(array $query = [], ?string $token = null): array
    {
        return $this->columnAt($this->read($query, $token), 'action', 'data');
    }

    public function testListsNewestFirstWithWhoDidWhatAndWhere(): void
    {
        $record = Uuid::v7();
        $this->entry(self::T0, $this->adminId, 'create', 'roles', $record, null, '{"name": "Ops"}');
        $this->entry(
            '2026-10-01 11:00:00.000',
            $this->adminId,
            'update',
            'roles',
            $record,
            '{"name": "Ops"}',
            '{"name": "Ops 2"}',
        );

        $page = $this->read();

        $rows = $this->rowsAt($page, 'data');
        self::assertSame(['update', 'create'], array_column($rows, 'action'));
        self::assertSame('2026-10-01T11:00:00.000Z', $rows[0]['occurred_at']);
        // The helper writes the entry the old way, without the name of who acted: it shows today's name and says so.
        self::assertEquals(['id' => $this->adminId, 'name' => 'Admin', 'name_is_current' => true], $rows[0]['user']);
        self::assertSame('roles', $rows[0]['entity_type']);
        self::assertSame($record, $rows[0]['entity_id']);
        self::assertEquals(['name' => 'Ops'], $rows[0]['before']);
        self::assertEquals(['name' => 'Ops 2'], $rows[0]['after']);
        self::assertNull($rows[1]['before']);
        self::assertSame('203.0.113.9', $rows[0]['ip_address']);
        self::assertNull($this->valueAt($page, 'meta', 'next_cursor'));
        self::assertSame(50, $this->valueAt($page, 'meta', 'limit'));
    }

    public function testAnEntryByNoOneHasNoUser(): void
    {
        $this->entry(self::T0, null, 'lockout');

        $rows = $this->rowsAt($this->read(), 'data');

        self::assertNull($rows[0]['user']);
    }

    public function testFiltersByWhoWhatWhichRecordAndAction(): void
    {
        $ana = $this->createUser('ana@example.com');
        $record = Uuid::v7();
        $this->entry('2026-10-01 10:00:00.000', $this->adminId, 'create', 'roles');
        $this->entry('2026-10-01 10:01:00.000', $ana['id'], 'update', 'users', $record);
        $this->entry('2026-10-01 10:02:00.000', $ana['id'], 'login', 'users', $ana['id']);
        $this->entry('2026-10-01 10:03:00.000', $this->adminId, 'update', 'users', $record);

        self::assertSame(['login', 'update'], $this->actions(['user_id' => $ana['id']]));
        self::assertSame(['create'], $this->actions(['entity_type' => 'roles']));
        self::assertSame(['update', 'update'], $this->actions(['entity_id' => $record]));
        self::assertSame(['update', 'update'], $this->actions(['action' => 'update']));
        self::assertSame(['update'], $this->actions(['action' => 'update', 'user_id' => $ana['id']]));
        self::assertSame([], $this->actions(['entity_type' => 'nothing']));
    }

    public function testFiltersByAnInclusiveTimeRange(): void
    {
        $this->entry('2026-10-01 10:00:00.000', $this->adminId, 'a');
        $this->entry('2026-10-01 11:00:00.000', $this->adminId, 'b');
        $this->entry('2026-10-01 12:00:00.000', $this->adminId, 'c');

        self::assertSame(['c', 'b'], $this->actions(['from' => '2026-10-01T11:00:00.000Z']));
        self::assertSame(['b', 'a'], $this->actions(['to' => '2026-10-01T11:00:00Z']));
        self::assertSame(['b'], $this->actions(['from' => '2026-10-01T11:00:00Z', 'to' => '2026-10-01T11:00:00Z']));
    }

    public function testRejectsABadTimeAnImpossibleRangeABadCursorAndBadLimits(): void
    {
        $bad = [
            ['from' => 'yesterday'],
            ['from' => '2026-02-31T10:00:00Z'],
            ['to' => '2026-10-01'],
            ['from' => '2026-10-02T00:00:00Z', 'to' => '2026-10-01T00:00:00Z'],
            ['cursor' => 'not-a-cursor'],
            ['cursor' => base64_encode('{"t":"x","i":"y"}')],
            ['limit' => 0],
            ['limit' => 101],
            ['user_id' => 'nope'],
            ['entity_id' => 'nope'],
        ];
        foreach ($bad as $query) {
            $response = $this->api('GET', '/audit-logs?' . http_build_query($query), $this->adminToken);
            self::assertSame(422, $response->getStatusCode(), json_encode($query, JSON_THROW_ON_ERROR));
        }
    }

    public function testPagesByCursorWithoutRepeatsOrGapsEvenWhenEntriesShareAMoment(): void
    {
        $expected = [];
        for ($i = 0; $i < 7; $i++) {
            // Five of them in the very same millisecond: the id has to break the tie.
            $at = $i < 5 ? '2026-10-01 10:00:00.000' : sprintf('2026-10-01 10:00:0%d.000', $i - 4);
            $expected[] = $this->entry($at, $this->adminId, 'e' . $i);
        }

        $seen = [];
        $cursor = null;
        $pages = 0;
        do {
            $query = ['limit' => 3] + ($cursor === null ? [] : ['cursor' => $cursor]);
            $page = $this->read($query);
            array_push($seen, ...$this->columnAt($page, 'id', 'data'));
            $cursor = $this->valueAt($page, 'meta', 'next_cursor');
            $pages++;
        } while (is_string($cursor) && $pages < 10);

        self::assertSame(3, $pages);
        self::assertCount(7, $seen);
        self::assertCount(7, array_unique($seen), 'No entry twice.');
        self::assertEqualsCanonicalizing($expected, $seen, 'No entry missing.');
    }

    public function testANewEntryWhileReadingDoesNotShiftTheNextPage(): void
    {
        foreach (range(1, 4) as $i) {
            $this->entry(sprintf('2026-10-01 10:0%d:00.000', $i), $this->adminId, 'old' . $i);
        }
        $first = $this->read(['limit' => 2]);
        $cursor = $this->valueAt($first, 'meta', 'next_cursor');
        self::assertIsString($cursor);

        $this->entry('2026-10-01 10:09:00.000', $this->adminId, 'brand-new');

        self::assertSame(['old2', 'old1'], $this->actions(['limit' => 2, 'cursor' => $cursor]));
    }

    public function testTheCursorIsNullOnTheLastPage(): void
    {
        $this->entry(self::T0, $this->adminId, 'a');
        $this->entry('2026-10-01 10:01:00.000', $this->adminId, 'b');

        self::assertNull($this->valueAt($this->read(['limit' => 2]), 'meta', 'next_cursor'));
        self::assertIsString($this->valueAt($this->read(['limit' => 1]), 'meta', 'next_cursor'));
    }

    public function testNeedsThePermissionAndASession(): void
    {
        self::assertSame(401, $this->api('GET', '/audit-logs')->getStatusCode());
        $other = $this->tokenWith('users', 'view', 'edit');

        self::assertSame(403, $this->api('GET', '/audit-logs', $other)->getStatusCode());
        $viewer = $this->tokenWith('audit_logs', 'view');
        self::assertSame(200, $this->api('GET', '/audit-logs', $viewer)->getStatusCode());
    }

    public function testTheScopeOfTheReaderAppliesToTheActorOfEachEntry(): void
    {
        $ana = $this->createUser('ana@example.com');
        $bo = $this->createUser('bo@example.com');
        $this->entry('2026-10-01 10:00:00.000', $ana['id'], 'by-ana');
        $this->entry('2026-10-01 10:01:00.000', $bo['id'], 'by-bo');
        $this->entry('2026-10-01 10:02:00.000', null, 'by-nobody');

        $own = $this->createRole('Own', ['audit_logs' => ['view']], ['audit_logs' => 'own']);
        $anaOwn = $this->tokenFor($this->createUser('ana2@example.com', [$own])['id']);
        self::assertSame([], $this->actions(token: $anaOwn), 'Own: only what the reader did.');

        $this->entry('2026-10-01 10:03:00.000', $this->idOf('ana2@example.com'), 'by-ana2');
        self::assertSame(['by-ana2'], $this->actions(token: $anaOwn));

        $all = $this->createRole('All', ['audit_logs' => ['view']], ['audit_logs' => 'all']);
        $everything = $this->tokenFor($this->createUser('boss@example.com', [$all])['id']);
        self::assertSame(['by-ana2', 'by-nobody', 'by-bo', 'by-ana'], $this->actions(token: $everything));
    }

    public function testTheTeamSeesWhatItsMembersDid(): void
    {
        $team = $this->createDepartment('Ops');
        $role = $this->createRole('Team', ['audit_logs' => ['view']], ['audit_logs' => 'team']);
        $lead = $this->createUser('lead@example.com', [$role]);
        $member = $this->createUser('member@example.com');
        $outsider = $this->createUser('outsider@example.com');
        $this->placeUser($lead['id'], $team);
        $this->placeUser($member['id'], $team);
        $this->entry('2026-10-01 10:00:00.000', $member['id'], 'by-member');
        $this->entry('2026-10-01 10:01:00.000', $outsider['id'], 'by-outsider');

        self::assertSame(['by-member'], $this->actions(token: $this->tokenFor($lead['id'])));
    }

    public function testNothingCanWriteToTheAuditLogOverTheApi(): void
    {
        $this->entry(self::T0, $this->adminId, 'a');

        foreach (['POST', 'PUT', 'PATCH', 'DELETE'] as $method) {
            $response = $this->api($method, '/audit-logs', $this->adminToken, []);
            self::assertSame(405, $response->getStatusCode(), $method);
        }
        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM audit_logs'));
    }

    public function testTheRealTrailOfAChangeIsReadable(): void
    {
        $ana = $this->createUser('ana@example.com');
        $this->api('POST', '/users/' . $ana['id'] . '/deactivate', $this->adminToken);

        $rows = $this->rowsAt($this->read(['entity_id' => $ana['id']]), 'data');

        self::assertSame(['deactivate'], array_column($rows, 'action'));
        self::assertEquals(['is_active' => true], $rows[0]['before']);
        self::assertSame('Admin', $this->valueAt($rows[0], 'user', 'name'));
    }

    private function idOf(string $email): string
    {
        $hex = $this->connection->fetchOne(
            'SELECT LOWER(HEX(id)) FROM users WHERE email = :email',
            ['email' => $email],
        );
        self::assertIsString($hex);

        return Uuid::fromHex($hex);
    }

    /** @return array<string, mixed> the entry of the audit read back for a record and an action */
    private function entryOf(string $entityId, string $action): array
    {
        foreach ($this->rowsAt($this->read(['entity_id' => $entityId]), 'data') as $row) {
            if ($row['action'] === $action) {
                return $row;
            }
        }
        self::fail("No $action entry for the record.");
    }

    public function testAnEntryCarriesTheNameOfTheRecordAtTheMomentOfTheChange(): void
    {
        $created = $this->json($this->api('POST', '/roles', $this->adminToken, [
            'name' => 'Ventas',
            'user_type' => 'internal',
            'permissions' => [],
            'scopes' => [],
        ]));
        $id = $this->text($created, 'id');
        $this->clock->advance('+1 minute');
        $this->api('PATCH', '/roles/' . $id, $this->adminToken, ['version' => 1, 'name' => 'Comercial']);

        $create = $this->entryOf($id, 'create');
        $update = $this->entryOf($id, 'update');

        self::assertSame('Ventas', $create['entity_label']);
        self::assertFalse($create['entity_label_is_current']);
        self::assertSame('Comercial', $update['entity_label']);
    }

    public function testARenameDoesNotRewriteTheNameOfEarlierEntries(): void
    {
        $role = $this->createRole('Ventas');
        $this->api('POST', '/roles/' . $role . '/deactivate', $this->adminToken);
        $this->connection->executeStatement(
            'UPDATE roles SET name = :name WHERE id = UNHEX(:id)',
            ['name' => 'Renombrado después', 'id' => Uuid::toHex($role)],
        );

        $entry = $this->entryOf($role, 'deactivate');

        self::assertSame('Ventas', $entry['entity_label']);
        self::assertFalse($entry['entity_label_is_current']);
    }

    public function testEachKindOfRecordGetsItsOwnName(): void
    {
        $ana = $this->createUser('ana@example.com', name: 'Ana Gómez');
        $this->api('POST', '/users/' . $ana['id'] . '/deactivate', $this->adminToken);
        $department = $this->json($this->api('POST', '/departments', $this->adminToken, ['name' => 'Operaciones']));
        $session = $this->json($this->login('admin@example.com', body: [
            'device' => ['platform' => 'android', 'name' => 'Pixel 8'],
        ]));
        $deviceId = $this->text($session, 'device_id');
        $this->api('DELETE', '/me/devices/' . $deviceId, $this->text($session, 'access_token'));

        self::assertSame('Ana Gómez', $this->entryOf($ana['id'], 'deactivate')['entity_label']);
        self::assertSame('Operaciones', $this->entryOf($this->text($department, 'id'), 'create')['entity_label']);
        self::assertSame('Pixel 8', $this->entryOf($deviceId, 'device_revoke')['entity_label']);
    }

    public function testTheLoginEntryNamesThePersonWhoSignedIn(): void
    {
        $this->login('admin@example.com');

        self::assertSame('Admin', $this->entryOf($this->adminId, 'login')['entity_label']);
    }

    public function testASingleRowSettingHasNoName(): void
    {
        $this->api('PATCH', '/settings/security', $this->adminToken, [
            'version' => 1,
            'web_idle_minutes' => 30,
            'mobile_refresh_days' => 30,
            'max_failed_attempts' => 5,
            'lockout_minutes' => 15,
            'password_expiry_days' => 90,
            'password_min_length' => 12,
        ]);

        $rows = $this->rowsAt($this->read(['entity_type' => 'security_settings']), 'data');

        self::assertNull($rows[0]['entity_label']);
        self::assertFalse($rows[0]['entity_label_is_current']);
    }

    public function testAnEntryFromBeforeNamesWereStoredShowsTheCurrentNameAndSaysSo(): void
    {
        $role = $this->createRole('Nombre de hoy');
        $this->entry(self::T0, $this->adminId, 'update', 'roles', $role);

        $entry = $this->entryOf($role, 'update');

        self::assertSame('Nombre de hoy', $entry['entity_label']);
        self::assertTrue($entry['entity_label_is_current']);
    }

    public function testAnOldEntryWhoseRecordIsGoneHasNoName(): void
    {
        $this->entry(self::T0, $this->adminId, 'update', 'roles', Uuid::v7());

        $rows = $this->rowsAt($this->read(['entity_type' => 'roles']), 'data');

        self::assertNull($rows[0]['entity_label']);
        self::assertFalse($rows[0]['entity_label_is_current']);
    }

    public function testTheNameOfWhoActedIsTheOneTheyHadAtTheTime(): void
    {
        $role = $this->createRole('Ops');
        $this->api('POST', '/roles/' . $role . '/deactivate', $this->adminToken);
        $this->connection->executeStatement(
            "UPDATE users SET name = 'Admin con otro nombre' WHERE id = UNHEX(:id)",
            ['id' => Uuid::toHex($this->adminId)],
        );

        $entry = $this->entryOf($role, 'deactivate');

        self::assertSame('Admin', $this->valueAt($entry, 'user', 'name'));
        self::assertFalse($this->valueAt($entry, 'user', 'name_is_current'));
    }

    public function testAnEntryWrittenWithoutTheNameShowsTodaysAndSaysSo(): void
    {
        $this->entry(self::T0, $this->adminId, 'update', 'roles');
        $this->connection->executeStatement(
            "UPDATE users SET name = 'Nombre de hoy' WHERE id = UNHEX(:id)",
            ['id' => Uuid::toHex($this->adminId)],
        );

        $rows = $this->rowsAt($this->read(['entity_type' => 'roles']), 'data');

        self::assertSame('Nombre de hoy', $this->valueAt($rows[0], 'user', 'name'));
        self::assertTrue($this->valueAt($rows[0], 'user', 'name_is_current'));
    }

    public function testAnEntryByNoOneStillHasNoUser(): void
    {
        $this->login('nobody@example.com', 'a wrong password');
        $ana = $this->createUser('ana@example.com');
        foreach (range(1, 3) as $ignored) {
            $this->login('ana@example.com', 'a wrong password');
        }

        $rows = $this->rowsAt($this->read(['entity_id' => $ana['id']]), 'data');

        self::assertSame('lockout', $rows[0]['action']);
        self::assertNull($rows[0]['user']);
    }
}
