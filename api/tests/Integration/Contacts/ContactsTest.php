<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Contacts;

use Soltec\Tests\Integration\Access\AccessTestCase;

final class ContactsTest extends AccessTestCase
{
    private const ALL = ['view', 'create', 'edit', 'deactivate'];

    private string $adminToken;
    private string $adminId;

    protected function setUp(): void
    {
        parent::setUp();
        $admin = $this->createAdmin();
        $this->adminId = $admin['id'];
        $this->adminToken = $this->tokenFor($admin['id']);
    }

    public function testCreatesAContactOwnedByTheCallerWithAnAutomaticCodeAndAuditsIt(): void
    {
        $response = $this->api('POST', '/contacts', $this->adminToken, [
            'name' => '  Ana López  ',
            'phone' => '2222-3333',
            'mobile' => '',
            'email' => 'Ana@Example.com',
            'address' => '5a avenida 10-20',
            'zone' => 'Zona 10',
            'country' => 'Guatemala',
            'owner_id' => '0192a1b2-0000-7000-8000-000000000000',
        ]);

        self::assertSame(201, $response->getStatusCode());
        $contact = $this->json($response);
        self::assertSame('CON-0001', $contact['code']);
        self::assertSame('Ana López', $contact['name']);
        self::assertNull($contact['mobile']);
        // The email is stored in lower case, like the one of a user.
        self::assertSame('ana@example.com', $contact['email']);
        self::assertSame(['id' => $this->adminId, 'name' => 'Admin'], $contact['owner']);
        self::assertTrue($contact['is_active']);
        self::assertSame(1, $contact['version']);

        $audit = $this->auditEntries('contacts', $this->text($contact, 'id'));
        self::assertSame(['create'], array_column($audit, 'action'));
        self::assertSame('CON-0001', $this->valueAt($audit[0], 'after', 'code'));
        self::assertSame($this->adminId, $this->valueAt($audit[0], 'after', 'owner_id'));
    }

    public function testCodesAreConsecutive(): void
    {
        $first = $this->json($this->api('POST', '/contacts', $this->adminToken, ['name' => 'Uno']));
        $second = $this->json($this->api('POST', '/contacts', $this->adminToken, ['name' => 'Dos']));

        self::assertSame(['CON-0001', 'CON-0002'], [$first['code'], $second['code']]);
    }

    public function testOnlyTheNameIsRequiredAndTheFieldsAreValidated(): void
    {
        $empty = $this->api('POST', '/contacts', $this->adminToken, ['name' => ' ']);
        self::assertSame(['name' => 'required'], $this->errorCodes($empty));

        $bad = $this->api('POST', '/contacts', $this->adminToken, [
            'name' => str_repeat('a', 151),
            'email' => 'not-an-email',
            'phone' => str_repeat('1', 41),
            'zone' => str_repeat('z', 101),
        ]);
        self::assertSame(
            ['name' => 'too_long', 'email' => 'invalid', 'phone' => 'too_long', 'zone' => 'too_long'],
            $this->errorCodes($bad),
        );

        $minimal = $this->api('POST', '/contacts', $this->adminToken, ['name' => 'Solo nombre']);
        self::assertSame(201, $minimal->getStatusCode());
    }

    public function testNeitherTheNameNorTheEmailHasToBeUnique(): void
    {
        $body = ['name' => 'María Pérez', 'email' => 'maria@example.com'];
        foreach ([1, 2] as $attempt) {
            $response = $this->api('POST', '/contacts', $this->adminToken, $body);
            self::assertSame(201, $response->getStatusCode(), 'attempt ' . $attempt);
        }
    }

    public function testListsByNameHidesInactiveOnesAndSearchesEveryContactField(): void
    {
        $this->create('Zacarías', ['email' => 'z@example.com']);
        $this->create('Beatriz', ['phone' => '5555-1234']);
        $this->create('Carlos', ['mobile' => '4444-9876']);
        $this->create('Dormido', [], active: false);

        $active = $this->json($this->api('GET', '/contacts?per_page=100', $this->adminToken));
        self::assertSame(['Beatriz', 'Carlos', 'Zacarías'], $this->columnAt($active, 'name', 'data'));

        $inactive = $this->json($this->api('GET', '/contacts?status=inactive', $this->adminToken));
        self::assertSame(['Dormido'], $this->columnAt($inactive, 'name', 'data'));

        $searches = ['z@exam' => 'Zacarías', '5555-12' => 'Beatriz', '4444-98' => 'Carlos', 'CON-0002' => 'Beatriz'];
        foreach ($searches as $text => $name) {
            $found = $this->json($this->api('GET', '/contacts?status=all&q=' . urlencode($text), $this->adminToken));
            self::assertSame([$name], $this->columnAt($found, 'name', 'data'), $text);
        }
    }

    public function testEditsWithTheVersionItReadAndAuditsOnlyWhatChanged(): void
    {
        $id = $this->create('Original', ['phone' => '1111-1111', 'zone' => 'Zona 1']);

        $edited = $this->api('PATCH', '/contacts/' . $id, $this->adminToken, [
            'version' => 1,
            'name' => 'Cambiado',
            'phone' => '1111-1111',
        ]);
        self::assertSame(200, $edited->getStatusCode());
        $contact = $this->json($edited);
        self::assertSame('Cambiado', $contact['name']);
        // The fields are replaced as a whole: what the request leaves out is cleared.
        self::assertNull($contact['zone']);
        self::assertSame(2, $contact['version']);

        $stale = $this->api('PATCH', '/contacts/' . $id, $this->adminToken, ['version' => 1, 'name' => 'Otro']);
        self::assertSame(409, $stale->getStatusCode());
        self::assertSame('conflict', $this->json($stale)['code']);

        $audit = $this->auditEntries('contacts', $id);
        self::assertSame(['create', 'update'], array_column($audit, 'action'));
        self::assertSame(['name' => 'Original', 'zone' => 'Zona 1'], $audit[1]['before']);
        self::assertSame(['name' => 'Cambiado', 'zone' => null], $audit[1]['after']);
    }

    public function testAnEditThatChangesNothingIsNotAudited(): void
    {
        $id = $this->create('Igual');
        $this->api('PATCH', '/contacts/' . $id, $this->adminToken, ['version' => 1, 'name' => 'Igual']);

        self::assertSame(['create'], array_column($this->auditEntries('contacts', $id), 'action'));
    }

    public function testDeactivatesAndReactivatesIdempotently(): void
    {
        $id = $this->create('Ciclo');

        $first = $this->json($this->api('POST', '/contacts/' . $id . '/deactivate', $this->adminToken));
        self::assertFalse($first['is_active']);
        $again = $this->json($this->api('POST', '/contacts/' . $id . '/deactivate', $this->adminToken));
        self::assertSame($first['version'], $again['version']);

        $back = $this->json($this->api('POST', '/contacts/' . $id . '/reactivate', $this->adminToken));
        self::assertTrue($back['is_active']);
        $this->api('POST', '/contacts/' . $id . '/reactivate', $this->adminToken);

        self::assertSame(
            ['create', 'deactivate', 'reactivate'],
            array_column($this->auditEntries('contacts', $id), 'action'),
        );
    }

    public function testUnknownIdsAnswerNotFound(): void
    {
        $missing = '/contacts/0192a1b2-0000-7000-8000-000000000000';

        self::assertSame(404, $this->api('GET', $missing, $this->adminToken)->getStatusCode());
        self::assertSame(404, $this->api('POST', $missing . '/deactivate', $this->adminToken)->getStatusCode());
        self::assertSame(404, $this->api('POST', $missing . '/reactivate', $this->adminToken)->getStatusCode());
        self::assertSame(404, $this->api('GET', '/contacts/not-a-uuid', $this->adminToken)->getStatusCode());
    }

    public function testEachActionNeedsItsOwnPermission(): void
    {
        $id = $this->create('Protegido');
        $viewer = $this->tokenWith('contacts', 'view');
        $editor = $this->tokenWith('contacts', 'view', 'edit');

        self::assertSame(200, $this->api('GET', '/contacts', $viewer)->getStatusCode());
        self::assertSame(403, $this->api('POST', '/contacts', $viewer, ['name' => 'x'])->getStatusCode());
        $patch = $this->api('PATCH', '/contacts/' . $id, $viewer, ['version' => 1, 'name' => 'x']);
        self::assertSame(403, $patch->getStatusCode());
        self::assertSame(403, $this->api('POST', '/contacts/' . $id . '/deactivate', $editor)->getStatusCode());
        self::assertSame(403, $this->api('POST', '/contacts/' . $id . '/reactivate', $editor)->getStatusCode());
        $own = $this->api('PATCH', '/contacts/' . $id, $editor, ['version' => 1, 'name' => 'Editado']);
        // The contact belongs to the admin and this editor only reaches their own (`all` was granted by tokenWith).
        self::assertSame(200, $own->getStatusCode());
    }

    // ---- data scope (ADR-0025) ----

    public function testScopeOwnShowsOnlyTheContactsTheUserEntered(): void
    {
        [$ana, $anaToken] = $this->advisor('ana@example.com', 'own');
        [, $beaToken] = $this->advisor('bea@example.com', 'own');
        $mine = $this->create('De Ana', token: $anaToken);
        $theirs = $this->create('De Bea', token: $beaToken);
        $this->create('Del admin');

        $list = $this->json($this->api('GET', '/contacts?per_page=100', $anaToken));
        self::assertSame(['De Ana'], $this->columnAt($list, 'name', 'data'));
        $owner = ($this->rowsAt($list, 'data')[0] ?? [])['owner'] ?? null;
        self::assertIsArray($owner);
        self::assertSame($ana, $owner['id'] ?? null);

        self::assertSame(200, $this->api('GET', '/contacts/' . $mine, $anaToken)->getStatusCode());
        // Outside the scope the contact does not exist: 404 on every route, never 403.
        self::assertSame(404, $this->api('GET', '/contacts/' . $theirs, $anaToken)->getStatusCode());
        $patch = $this->api('PATCH', '/contacts/' . $theirs, $anaToken, ['version' => 1, 'name' => 'Robado']);
        self::assertSame(404, $patch->getStatusCode());
        self::assertSame(404, $this->api('POST', '/contacts/' . $theirs . '/deactivate', $anaToken)->getStatusCode());
        self::assertSame(404, $this->api('POST', '/contacts/' . $theirs . '/reactivate', $anaToken)->getStatusCode());
        self::assertSame('De Bea', $this->json($this->api('GET', '/contacts/' . $theirs, $this->adminToken))['name']);
    }

    public function testScopeOwnCannotListAnotherOwnersContactsEvenFilteringByThem(): void
    {
        [, $anaToken] = $this->advisor('ana@example.com', 'own');
        [$bea, $beaToken] = $this->advisor('bea@example.com', 'own');
        $this->create('De Bea', token: $beaToken);

        $list = $this->json($this->api('GET', '/contacts?owner_id=' . $bea, $anaToken));

        self::assertSame([], $this->columnAt($list, 'name', 'data'));
        self::assertSame(0, $this->valueAt($list, 'meta', 'total'));
    }

    public function testScopeTeamReachesTheContactsOfTheTeamAndNobodyElse(): void
    {
        $lead = $this->createUser('lead@example.com', [$this->roleWith('team')], name: 'Lead');
        $direct = $this->createUser('direct@example.com', [$this->roleWith('own', 'Direct role')], name: 'Direct');
        $outsider = $this->createUser('outsider@example.com', [$this->roleWith('own', 'Out role')], name: 'Out');
        $this->placeUser($direct['id'], null, $lead['id']);
        $leadToken = $this->tokenFor($lead['id']);

        $own = $this->create('Del lead', token: $leadToken);
        $team = $this->create('Del directo', token: $this->tokenFor($direct['id']));
        $far = $this->create('Del ajeno', token: $this->tokenFor($outsider['id']));

        $list = $this->json($this->api('GET', '/contacts?per_page=100', $leadToken));
        self::assertSame(['Del directo', 'Del lead'], $this->columnAt($list, 'name', 'data'));
        self::assertSame(200, $this->api('GET', '/contacts/' . $team, $leadToken)->getStatusCode());
        self::assertSame(200, $this->api('GET', '/contacts/' . $own, $leadToken)->getStatusCode());
        self::assertSame(404, $this->api('GET', '/contacts/' . $far, $leadToken)->getStatusCode());
    }

    public function testScopeAllReachesEveryContact(): void
    {
        [, $anaToken] = $this->advisor('ana@example.com', 'own');
        $this->create('De Ana', token: $anaToken);
        $this->create('Del admin');

        $list = $this->json($this->api('GET', '/contacts?per_page=100', $this->adminToken));

        self::assertSame(['De Ana', 'Del admin'], $this->columnAt($list, 'name', 'data'));
    }

    public function testAClientScopeReachesNoContacts(): void
    {
        $this->create('Del admin');
        $role = $this->createRole('Portal', ['contacts' => self::ALL], ['contacts' => 'client']);
        $token = $this->tokenFor($this->createUser('portal@example.com', [$role])['id']);

        $list = $this->json($this->api('GET', '/contacts', $token));

        self::assertSame([], $this->columnAt($list, 'name', 'data'));
    }

    // ---- moving a contact to another owner ----

    public function testScopeAllMovesAContactToAnotherActiveInternalUser(): void
    {
        [$ana] = $this->advisor('ana@example.com', 'own');
        $id = $this->create('Mudanza');

        $moved = $this->api('PATCH', '/contacts/' . $id, $this->adminToken, [
            'version' => 1,
            'name' => 'Mudanza',
            'owner_id' => $ana,
        ]);

        self::assertSame(200, $moved->getStatusCode());
        self::assertSame($ana, $this->valueAt($this->json($moved), 'owner', 'id'));
        $audit = $this->auditEntries('contacts', $id);
        self::assertSame(['owner_id' => $this->adminId], $audit[1]['before']);
        self::assertSame(['owner_id' => $ana], $audit[1]['after']);
    }

    public function testOmittingTheOwnerKeepsIt(): void
    {
        [$ana, $anaToken] = $this->advisor('ana@example.com', 'own');
        $id = $this->create('Mío', token: $anaToken);

        $edited = $this->api('PATCH', '/contacts/' . $id, $anaToken, ['version' => 1, 'name' => 'Mío 2']);

        self::assertSame($ana, $this->valueAt($this->json($edited), 'owner', 'id'));
    }

    public function testTheNewOwnerMustBeAnActiveInternalUser(): void
    {
        $id = $this->create('Mudanza');
        $gone = $this->createUser('gone@example.com');
        $this->connection->executeStatement("UPDATE users SET deleted_at = NOW(3) WHERE email = 'gone@example.com'");

        foreach ([$gone['id'], '0192a1b2-0000-7000-8000-000000000000'] as $owner) {
            $response = $this->api('PATCH', '/contacts/' . $id, $this->adminToken, [
                'version' => 1,
                'name' => 'Mudanza',
                'owner_id' => $owner,
            ]);
            self::assertSame(['owner_id' => 'not_found'], $this->errorCodes($response));
        }
    }

    public function testScopeOwnCannotHandAContactToSomeoneElse(): void
    {
        [$ana, $anaToken] = $this->advisor('ana@example.com', 'own');
        [$bea] = $this->advisor('bea@example.com', 'own');
        $id = $this->create('Mío', token: $anaToken);

        $response = $this->api('PATCH', '/contacts/' . $id, $anaToken, [
            'version' => 1,
            'name' => 'Mío',
            'owner_id' => $bea,
        ]);

        self::assertSame(403, $response->getStatusCode());
        $after = $this->json($this->api('GET', '/contacts/' . $id, $this->adminToken));
        self::assertSame($ana, $this->valueAt($after, 'owner', 'id'));
    }

    public function testScopeTeamMovesContactsOnlyWithinTheTeam(): void
    {
        $lead = $this->createUser('lead@example.com', [$this->roleWith('team')], name: 'Lead');
        $direct = $this->createUser('direct@example.com', [$this->roleWith('own', 'Direct role')], name: 'Direct');
        $outsider = $this->createUser('outsider@example.com', [$this->roleWith('own', 'Out role')], name: 'Out');
        $this->placeUser($direct['id'], null, $lead['id']);
        $leadToken = $this->tokenFor($lead['id']);
        $id = $this->create('Del lead', token: $leadToken);

        $outside = $this->api('PATCH', '/contacts/' . $id, $leadToken, [
            'version' => 1,
            'name' => 'Del lead',
            'owner_id' => $outsider['id'],
        ]);
        self::assertSame(['owner_id' => 'out_of_scope'], $this->errorCodes($outside));

        $inside = $this->api('PATCH', '/contacts/' . $id, $leadToken, [
            'version' => 1,
            'name' => 'Del lead',
            'owner_id' => $direct['id'],
        ]);
        self::assertSame(200, $inside->getStatusCode());
    }

    public function testTheMigrationCanBeRepeatedWithoutDuplicatingAnything(): void
    {
        $this->applyMigrationAgain('20261013000004');

        self::assertSame(1, $this->countRows("SELECT COUNT(*) FROM sequences WHERE code = 'contact'"));
        self::assertSame(69, $this->countRows('SELECT COUNT(*) FROM role_permissions'));
        self::assertSame(1, $this->countRows("SELECT COUNT(*) FROM resources WHERE code = 'contacts' AND scoped = 1"));
    }

    /**
     * @param array<string, string> $extra
     */
    private function create(string $name, array $extra = [], bool $active = true, ?string $token = null): string
    {
        $token ??= $this->adminToken;
        $response = $this->api('POST', '/contacts', $token, ['name' => $name] + $extra);
        self::assertSame(201, $response->getStatusCode());
        $id = $this->text($this->json($response), 'id');
        if (!$active) {
            $this->api('POST', '/contacts/' . $id . '/deactivate', $token);
        }

        return $id;
    }

    /** @return array{string, string} the user's id and a token */
    private function advisor(string $email, string $scope): array
    {
        $user = $this->createUser($email, [$this->roleWith($scope, 'Role ' . $email)], name: ucfirst($email));

        return [$user['id'], $this->tokenFor($user['id'])];
    }

    private function roleWith(string $scope, string $name = 'Contacts ' . 'role'): string
    {
        return $this->createRole($name . ' ' . $scope, ['contacts' => self::ALL], ['contacts' => $scope]);
    }
}
