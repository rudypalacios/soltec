<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Suppliers;

use Soltec\Tests\Integration\Access\AccessTestCase;

final class SuppliersTest extends AccessTestCase
{
    private string $adminToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminToken = $this->tokenFor($this->createAdmin()['id']);
    }

    /**
     * @param array<string, mixed> $extra
     * @return array<array-key, mixed>
     */
    private function createSupplier(string $name, array $extra = []): array
    {
        $body = $extra + ['name' => $name, 'identification_type' => 'none'];
        $response = $this->api('POST', '/suppliers', $this->adminToken, $body);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return $this->json($response);
    }

    /**
     * @param array<array-key, mixed> $supplier
     * @return list<bool>
     */
    private function primaries(array $supplier): array
    {
        $addresses = $this->rowsAt($supplier, 'addresses');

        return array_map(static fn (array $address): bool => $address['is_primary'] === true, $addresses);
    }

    private const GONE = '0192a1b2-0000-7000-8000-000000000000';

    private function statusOf(string $method, string $path, ?string $token = null): int
    {
        return $this->api($method, $path, $token ?? $this->adminToken)->getStatusCode();
    }

    /** @return array<array-key, mixed> */
    private function detail(string $id): array
    {
        return $this->json($this->api('GET', '/suppliers/' . $id, $this->adminToken));
    }

    private function contactTypeId(string $name): string
    {
        $id = $this->connection->fetchOne('SELECT LOWER(HEX(id)) FROM contact_types WHERE name = :n', ['n' => $name]);
        self::assertIsString($id);
        $hex = $id;

        return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4)
            . '-' . substr($hex, 20);
    }

    public function testCreatesASupplierWithAutomaticCodeAddressesAndPeopleAndAuditsIt(): void
    {
        $type = $this->contactTypeId('Compras');
        $supplier = $this->createSupplier('  Cables del Sur ', [
            'legal_name' => 'Cables del Sur, S. A.',
            'identification_type' => 'nit',
            'identification' => '6647912-6',
            'credit_days' => 30,
            'credit_limit' => '15000.5',
            'addresses' => [
                ['label' => 'Oficina', 'address' => '5a avenida 10-20', 'zone' => 'Zona 10'],
                ['label' => 'Bodega', 'address' => 'Km 14 carretera', 'is_primary' => true],
            ],
            'contacts' => [[
                'name' => 'Ana López',
                'job_title' => 'Ventas',
                'contact_type_id' => $type,
                'email' => 'Ana@Example.com',
                'mobile' => '5555-1111',
            ]],
        ]);

        self::assertSame('PRV-0001', $supplier['code']);
        self::assertSame('Cables del Sur', $supplier['name']);
        self::assertSame('6647912-6', $supplier['identification']);
        self::assertSame('15000.50', $supplier['credit_limit']);
        self::assertSame(30, $supplier['credit_days']);
        self::assertTrue($supplier['is_active']);
        self::assertSame([false, true], $this->primaries($supplier));
        $contact = $this->rowsAt($supplier, 'contacts')[0];
        self::assertSame('ana@example.com', $contact['email']);
        self::assertSame('Ventas', $contact['job_title']);
        self::assertSame(['id' => $type, 'name' => 'Compras'], $contact['contact_type']);

        $audit = $this->auditEntries('suppliers', $this->text($supplier, 'id'));
        self::assertSame(['create'], array_column($audit, 'action'));
        self::assertSame('PRV-0001', $this->valueAt($audit[0], 'after', 'code'));
        self::assertSame('66479126', $this->valueAt($audit[0], 'after', 'identification'));
        self::assertSame(
            'Cables del Sur',
            $this->connection->fetchOne('SELECT entity_label FROM audit_logs WHERE entity_type = \'suppliers\''),
        );
    }

    public function testTheFirstAddressBecomesThePrimaryWhenNoneIsMarked(): void
    {
        $supplier = $this->createSupplier('Uno', ['addresses' => [
            ['label' => 'A', 'address' => 'x'],
            ['label' => 'B', 'address' => 'y'],
        ]]);

        self::assertSame([true, false], $this->primaries($supplier));
    }

    public function testCodesAreConsecutive(): void
    {
        $first = $this->createSupplier('Uno');
        $second = $this->createSupplier('Dos');

        self::assertSame(['PRV-0001', 'PRV-0002'], [$first['code'], $second['code']]);
    }

    public function testValidatesTheFields(): void
    {
        $empty = $this->api('POST', '/suppliers', $this->adminToken, ['name' => ' ']);
        self::assertSame(['name' => 'required', 'identification_type' => 'required'], $this->errorCodes($empty));

        $bad = $this->api('POST', '/suppliers', $this->adminToken, [
            'name' => str_repeat('a', 191),
            'identification_type' => 'nit',
            'identification' => '6647912-5',
            'credit_days' => -1,
            'credit_limit' => '12.345',
            'addresses' => [
                ['label' => '', 'address' => 'x'],
                ['label' => 'B', 'address' => 'y', 'is_primary' => 'yes'],
            ],
            'contacts' => [['name' => 'Ana', 'email' => 'nope', 'contact_type_id' => 'not-a-uuid'], 'oops'],
        ]);
        $expected = [
                'name' => 'too_long',
                'identification' => 'invalid',
                'credit_days' => 'out_of_range',
                'credit_limit' => 'invalid',
                'addresses.0.label' => 'required',
                'addresses.1.is_primary' => 'invalid',
                'contacts.0.email' => 'invalid',
                'contacts.0.contact_type_id' => 'invalid',
                'contacts.1' => 'invalid',
        ];
        $actual = $this->errorCodes($bad);
        ksort($expected);
        ksort($actual);
        self::assertSame($expected, $actual);
    }

    public function testTheIdentificationFollowsItsType(): void
    {
        $missing = $this->api('POST', '/suppliers', $this->adminToken, ['name' => 'X', 'identification_type' => 'cui']);
        self::assertSame(['identification' => 'required'], $this->errorCodes($missing));

        $none = $this->api('POST', '/suppliers', $this->adminToken, [
            'name' => 'X', 'identification_type' => 'none', 'identification' => '123',
        ]);
        self::assertSame(['identification' => 'not_applicable'], $this->errorCodes($none));

        $cui = $this->createSupplier(
            'Persona',
            ['identification_type' => 'cui', 'identification' => '2432 15678 0101'],
        );
        self::assertSame('2432156780101', $cui['identification']);

        $nit = $this->createSupplier('K', ['identification_type' => 'nit', 'identification' => '555-k']);
        self::assertSame('555-K', $nit['identification']);
    }

    public function testTwoActiveSuppliersCannotShareAnIdentificationAndTheMessageNamesNobody(): void
    {
        $this->createSupplier('Primero', ['identification_type' => 'nit', 'identification' => '6647912-6']);

        $response = $this->api('POST', '/suppliers', $this->adminToken, [
            'name' => 'Segundo', 'identification_type' => 'nit', 'identification' => '66479126',
        ]);

        self::assertSame(409, $response->getStatusCode());
        $problem = $this->json($response);
        self::assertSame('identification_taken', $problem['code']);
        self::assertStringNotContainsString('Primero', json_encode($problem, JSON_THROW_ON_ERROR));
        // The failed attempt took no code: the next one continues the series.
        $third = $this->createSupplier('Tercero');
        self::assertSame('PRV-0002', $third['code']);
    }

    public function testSeveralSuppliersWithoutIdentificationAreAllowed(): void
    {
        $this->createSupplier('A');
        $this->createSupplier('B');

        self::assertSame(2, $this->countRows('SELECT COUNT(*) FROM suppliers'));
    }

    public function testADeactivatedSupplierKeepsItsIdentificationReserved(): void
    {
        $old = $this->createSupplier('Viejo', ['identification_type' => 'nit', 'identification' => '6647912-6']);
        $oldId = $this->text($old, 'id');
        $this->api('POST', '/suppliers/' . $oldId . '/deactivate', $this->adminToken);

        $response = $this->api('POST', '/suppliers', $this->adminToken, [
            'name' => 'Nuevo', 'identification_type' => 'nit', 'identification' => '66479126',
        ]);

        self::assertSame(409, $response->getStatusCode());
        $problem = $this->json($response);
        self::assertSame('identification_inactive', $problem['code']);
        // Whoever may reactivate is told which supplier it is, to do exactly that.
        self::assertSame($oldId, $problem['inactive_supplier_id']);
        self::assertSame('Viejo', $problem['inactive_supplier_name']);
        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM suppliers'));

        // Reactivating it is the way back; after that the identification is plainly taken.
        self::assertSame(200, $this->statusOf('POST', '/suppliers/' . $oldId . '/reactivate'));
        $again = $this->api('POST', '/suppliers', $this->adminToken, [
            'name' => 'Nuevo', 'identification_type' => 'nit', 'identification' => '66479126',
        ]);
        self::assertSame('identification_taken', $this->json($again)['code']);
    }

    public function testWhoCannotReactivateIsNotToldWhichSupplierHoldsTheIdentification(): void
    {
        $old = $this->createSupplier('Reservado', ['identification_type' => 'nit', 'identification' => '6647912-6']);
        $this->api('POST', '/suppliers/' . $this->text($old, 'id') . '/deactivate', $this->adminToken);
        $creator = $this->tokenWith('suppliers', 'view', 'create', 'edit');

        $response = $this->api('POST', '/suppliers', $creator, [
            'name' => 'Otro', 'identification_type' => 'nit', 'identification' => '6647912-6',
        ]);

        self::assertSame(409, $response->getStatusCode());
        $problem = $this->json($response);
        self::assertSame('identification_inactive', $problem['code']);
        self::assertStringNotContainsString('Reservado', json_encode($problem, JSON_THROW_ON_ERROR));
        self::assertArrayNotHasKey('inactive_supplier_id', $problem);
    }

    public function testEditingToAnIdentificationADeactivatedSupplierHoldsIsRefusedButKeepingOwnIsFine(): void
    {
        $old = $this->createSupplier('Viejo', ['identification_type' => 'nit', 'identification' => '6647912-6']);
        $this->api('POST', '/suppliers/' . $this->text($old, 'id') . '/deactivate', $this->adminToken);
        $mine = $this->createSupplier('Mio', ['identification_type' => 'nit', 'identification' => '1234567-9']);
        $path = '/suppliers/' . $this->text($mine, 'id');

        $taken = $this->api('PATCH', $path, $this->adminToken, [
            'version' => 1, 'name' => 'Mio', 'identification_type' => 'nit', 'identification' => '6647912-6',
        ]);
        self::assertSame('identification_inactive', $this->json($taken)['code']);

        $own = $this->api('PATCH', $path, $this->adminToken, [
            'version' => 1, 'name' => 'Mio renombrado', 'identification_type' => 'nit', 'identification' => '1234567-9',
        ]);
        self::assertSame(200, $own->getStatusCode());
    }

    public function testASupplierWithoutIdentificationNeverReservesAnything(): void
    {
        $none = $this->createSupplier('Sin NIT');
        $this->api('POST', '/suppliers/' . $this->text($none, 'id') . '/deactivate', $this->adminToken);

        $this->createSupplier('Otro sin NIT');
        $this->createSupplier('Con NIT', ['identification_type' => 'nit', 'identification' => '6647912-6']);

        self::assertSame(3, $this->countRows('SELECT COUNT(*) FROM suppliers'));
    }

    public function testReactivatingIsRefusedWhenDataFromBeforeTheRuleLetAnotherActiveOneHoldTheIdentification(): void
    {
        $old = $this->createSupplier('Viejo', ['identification_type' => 'nit', 'identification' => '6647912-6']);
        $oldId = $this->text($old, 'id');
        $this->api('POST', '/suppliers/' . $oldId . '/deactivate', $this->adminToken);
        // The state staging could already have: an active supplier with the identification of a deactivated one.
        $other = $this->createSupplier('Previo');
        $this->connection->executeStatement(
            "UPDATE suppliers SET identification_type = 'nit', identification = '66479126' WHERE id = UNHEX(:id)",
            ['id' => str_replace('-', '', $this->text($other, 'id'))],
        );

        $reactivate = $this->api('POST', '/suppliers/' . $oldId . '/reactivate', $this->adminToken);

        self::assertSame(409, $reactivate->getStatusCode());
        self::assertSame('identification_taken', $this->json($reactivate)['code']);
    }

    public function testDeactivateAndReactivateAreIdempotentAndAudited(): void
    {
        $id = $this->text($this->createSupplier('Uno'), 'id');

        foreach ([1, 2] as $_) {
            $off = $this->json($this->api('POST', '/suppliers/' . $id . '/deactivate', $this->adminToken));
            self::assertFalse($off['is_active']);
        }
        foreach ([1, 2] as $_) {
            $on = $this->json($this->api('POST', '/suppliers/' . $id . '/reactivate', $this->adminToken));
            self::assertTrue($on['is_active']);
        }

        self::assertSame(
            ['create', 'deactivate', 'reactivate'],
            array_column($this->auditEntries('suppliers', $id), 'action'),
        );
        self::assertSame(404, $this->statusOf('POST', '/suppliers/' . self::GONE . '/deactivate'));
    }

    public function testEditingReplacesTheDataAndTheSetsAndNeedsTheCurrentVersion(): void
    {
        $supplier = $this->createSupplier('Original', [
            'legal_name' => 'Original S. A.',
            'addresses' => [['label' => 'Oficina', 'address' => 'x']],
            'contacts' => [['name' => 'Ana'], ['name' => 'Beto']],
        ]);
        $id = $this->text($supplier, 'id');

        $response = $this->api('PATCH', '/suppliers/' . $id, $this->adminToken, [
            'version' => 1,
            'name' => 'Renombrado',
            'identification_type' => 'none',
            'contacts' => [['name' => 'Carla']],
        ]);

        self::assertSame(200, $response->getStatusCode());
        $edited = $this->json($response);
        self::assertSame('Renombrado', $edited['name']);
        self::assertNull($edited['legal_name']);
        self::assertSame([], $edited['addresses']);
        self::assertSame(['Carla'], $this->columnAt($edited, 'name', 'contacts'));
        self::assertSame(2, $edited['version']);

        $audit = $this->auditEntries('suppliers', $id);
        self::assertSame(['create', 'update'], array_column($audit, 'action'));
        $changed = $this->valueAt($audit[1], 'after');
        self::assertIsArray($changed);
        self::assertEqualsCanonicalizing(['name', 'legal_name', 'addresses', 'contacts'], array_keys($changed));

        $stale = $this->api('PATCH', '/suppliers/' . $id, $this->adminToken, [
            'version' => 1, 'name' => 'Tarde', 'identification_type' => 'none',
        ]);
        self::assertSame(409, $stale->getStatusCode());
        self::assertSame('Renombrado', $this->json($this->api('GET', '/suppliers/' . $id, $this->adminToken))['name']);
    }

    public function testEditingKeepsTheContactOrderAndDoesNotAuditAnUnchangedSave(): void
    {
        $supplier = $this->createSupplier('Orden', ['contacts' => [['name' => 'Zeta'], ['name' => 'Alfa']]]);
        $id = $this->text($supplier, 'id');
        self::assertSame(['Zeta', 'Alfa'], $this->columnAt($this->detail($id), 'name', 'contacts'));

        $same = $this->api('PATCH', '/suppliers/' . $id, $this->adminToken, [
            'version' => 1,
            'name' => 'Orden',
            'identification_type' => 'none',
            'contacts' => [['name' => 'Zeta'], ['name' => 'Alfa']],
        ]);

        self::assertSame(200, $same->getStatusCode());
        self::assertSame(['create'], array_column($this->auditEntries('suppliers', $id), 'action'));
    }

    public function testAPersonCannotBeFiledUnderAnInactiveOrUnknownTypeButKeepsOneSwitchedOffLater(): void
    {
        $type = $this->contactTypeId('Comercial');
        $supplier = $this->createSupplier('Tipos', ['contacts' => [['name' => 'Ana', 'contact_type_id' => $type]]]);
        $id = $this->text($supplier, 'id');

        $unknown = $this->api('POST', '/suppliers', $this->adminToken, [
            'name' => 'X',
            'identification_type' => 'none',
            'contacts' => [['name' => 'Ana', 'contact_type_id' => self::GONE]],
        ]);
        self::assertSame(['contacts.0.contact_type_id' => 'not_found'], $this->errorCodes($unknown));

        $this->connection->executeStatement(
            'UPDATE contact_types SET deleted_at = UTC_TIMESTAMP(3) WHERE name = :n',
            ['n' => 'Comercial'],
        );
        $inactive = $this->api('POST', '/suppliers', $this->adminToken, [
            'name' => 'Y',
            'identification_type' => 'none',
            'contacts' => [['name' => 'Beto', 'contact_type_id' => $type]],
        ]);
        self::assertSame(['contacts.0.contact_type_id' => 'not_found'], $this->errorCodes($inactive));

        // The supplier that already used it can be edited without losing it.
        $kept = $this->api('PATCH', '/suppliers/' . $id, $this->adminToken, [
            'version' => 1,
            'name' => 'Tipos',
            'identification_type' => 'none',
            'contacts' => [['name' => 'Ana', 'contact_type_id' => $type]],
        ]);
        self::assertSame(200, $kept->getStatusCode());
    }

    public function testListsWithSearchStatusAndPagesAndWithoutTheDetail(): void
    {
        $this->createSupplier('Cables del Sur', ['identification_type' => 'nit', 'identification' => '6647912-6']);
        $retired = $this->createSupplier('Zinc Retirado', ['legal_name' => 'Zinc S. A.']);
        $this->api('POST', '/suppliers/' . $this->text($retired, 'id') . '/deactivate', $this->adminToken);
        $this->createSupplier('Aceros', [
            'addresses' => [['label' => 'Oficina', 'address' => 'x']],
            'contacts' => [['name' => 'Ana']],
        ]);

        $active = $this->json($this->api('GET', '/suppliers', $this->adminToken));
        self::assertSame(['Aceros', 'Cables del Sur'], $this->columnAt($active, 'name', 'data'));
        self::assertArrayNotHasKey('addresses', $this->rowsAt($active, 'data')[0]);
        self::assertArrayNotHasKey('contacts', $this->rowsAt($active, 'data')[0]);
        self::assertSame(2, $this->valueAt($active, 'meta', 'total'));

        $inactive = $this->json($this->api('GET', '/suppliers?status=inactive', $this->adminToken));
        self::assertSame(['Zinc Retirado'], $this->columnAt($inactive, 'name', 'data'));

        $all = $this->json($this->api('GET', '/suppliers?status=all&per_page=2&page=2', $this->adminToken));
        self::assertSame(['Zinc Retirado'], $this->columnAt($all, 'name', 'data'));

        foreach (['sur', 'PRV-0001', '66479126', 'zinc s'] as $text) {
            $path = '/suppliers?status=all&q=' . rawurlencode($text);
            $found = $this->json($this->api('GET', $path, $this->adminToken));
            self::assertCount(1, $this->rowsAt($found, 'data'), $text);
        }
    }

    public function testShowsTheDetailAndAnUnknownSupplierIs404(): void
    {
        $id = $this->text($this->createSupplier('Uno', ['contacts' => [['name' => 'Ana']]]), 'id');

        self::assertSame(['Ana'], $this->columnAt($this->detail($id), 'name', 'contacts'));
        self::assertSame(404, $this->statusOf('GET', '/suppliers/' . self::GONE));
        self::assertSame(404, $this->api('GET', '/suppliers/not-a-uuid', $this->adminToken)->getStatusCode());
    }

    public function testOptionsListTheActiveSuppliersByNameWithoutTheRestOfTheData(): void
    {
        $this->createSupplier('Zeta', ['credit_limit' => '100']);
        $gone = $this->createSupplier('Baja');
        $this->api('POST', '/suppliers/' . $this->text($gone, 'id') . '/deactivate', $this->adminToken);
        $this->createSupplier('Alfa');

        $options = $this->json($this->api('GET', '/suppliers/options', $this->adminToken));

        self::assertSame(['Alfa', 'Zeta'], $this->columnAt($options, 'name', 'data'));
        self::assertSame(['id', 'code', 'name'], array_keys($this->rowsAt($options, 'data')[0]));
        $filtered = $this->json($this->api('GET', '/suppliers/options?q=zet', $this->adminToken));
        self::assertSame(['Zeta'], $this->columnAt($filtered, 'name', 'data'));
    }

    public function testEveryActionNeedsItsOwnPermission(): void
    {
        $id = $this->text($this->createSupplier('Uno'), 'id');
        $body = ['version' => 1, 'name' => 'X', 'identification_type' => 'none'];
        $viewer = $this->tokenWith('suppliers', 'view');

        self::assertSame(200, $this->api('GET', '/suppliers', $viewer)->getStatusCode());
        self::assertSame(200, $this->api('GET', '/suppliers/' . $id, $viewer)->getStatusCode());
        self::assertSame(403, $this->api('POST', '/suppliers', $viewer, $body)->getStatusCode());
        self::assertSame(403, $this->api('PATCH', '/suppliers/' . $id, $viewer, $body)->getStatusCode());
        self::assertSame(403, $this->api('POST', '/suppliers/' . $id . '/deactivate', $viewer)->getStatusCode());
        self::assertSame(403, $this->api('POST', '/suppliers/' . $id . '/reactivate', $viewer)->getStatusCode());

        $outsider = $this->tokenWith('contacts', 'view', 'create', 'edit', 'deactivate');
        self::assertSame(403, $this->api('GET', '/suppliers', $outsider)->getStatusCode());
        self::assertSame(403, $this->api('GET', '/suppliers/' . $id, $outsider)->getStatusCode());
        self::assertSame(401, $this->api('GET', '/suppliers')->getStatusCode());
    }

    public function testSeeingSuppliersNeedsNeitherContactsNorContactTypes(): void
    {
        // The people of a supplier are the supplier's own: no permission on `contacts` or `contact_types` is involved.
        $this->createSupplier('Uno', ['contacts' => [['name' => 'Ana']]]);
        $viewer = $this->tokenWith('suppliers', 'view');

        $list = $this->api('GET', '/suppliers', $viewer);
        self::assertSame(200, $list->getStatusCode());
        $first = $this->rowsAt($this->json($list), 'data')[0];
        $detail = $this->api('GET', '/suppliers/' . $this->text($first, 'id'), $viewer);
        self::assertSame(['Ana'], $this->columnAt($this->json($detail), 'name', 'contacts'));
        self::assertSame(200, $this->api('GET', '/contact-types/options', $viewer)->getStatusCode());
        self::assertSame(403, $this->api('GET', '/contact-types', $viewer)->getStatusCode());
        self::assertSame(403, $this->api('GET', '/contacts', $viewer)->getStatusCode());
        self::assertSame(403, $this->api('POST', '/contact-types', $viewer, ['name' => 'Nuevo'])->getStatusCode());
    }

    public function testAProfileWithActionsButNoViewIsNotSaved(): void
    {
        $role = $this->createRole('Proveedores', ['suppliers' => ['view']]);

        $response = $this->api('PATCH', '/roles/' . $role, $this->adminToken, [
            'version' => 1,
            'permissions' => ['suppliers' => ['create', 'edit']],
        ]);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame('view_required', $this->errorCodes($response)['permissions.suppliers'] ?? null);
    }

    public function testTheMigrationCanBeRepeatedWithoutDuplicatingAnything(): void
    {
        $this->applyMigrationAgain('20261014000001');

        self::assertSame(73, $this->countRows('SELECT COUNT(*) FROM role_permissions'));
        self::assertSame(1, $this->countRows("SELECT COUNT(*) FROM resources WHERE code = 'suppliers' AND scoped = 0"));
    }
}
