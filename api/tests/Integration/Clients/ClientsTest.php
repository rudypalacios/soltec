<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Clients;

/** The clients themselves: registration, identification, data scope, edition, conversion and deactivation. */
final class ClientsTest extends ClientsTestCase
{
    public function testRegistersAProspectWithTheCallerAsItsOnlyAndResponsibleAdviser(): void
    {
        $client = $this->createClient('Restaurante El Sol', [
            'segment_id' => $this->catalogId('segments', 'Restaurantes'),
            'addresses' => [['label' => 'Oficina', 'address' => '5a avenida 10-20', 'zone' => 'Zona 10']],
        ]);

        self::assertSame('CLI-0001', $client['code']);
        self::assertSame('prospect', $client['type']);
        self::assertSame('none', $client['identification_type']);
        self::assertNull($client['identification']);
        self::assertNull($client['billing_profile']);
        self::assertNull($client['converted_at']);
        self::assertSame(['id' => $this->segmentId('Restaurantes'), 'name' => 'Restaurantes'], $client['segment']);
        self::assertSame(1, $client['seller_count']);
        self::assertSame(
            [['user' => ['id' => $this->adminId, 'name' => 'Admin'], 'is_responsible' => true]],
            $client['sellers'],
        );
        self::assertSame($this->adminId, $this->valueAt($client, 'responsible', 'id'));
        self::assertTrue($this->valueAt($client, 'addresses', '0', 'is_primary'));

        $audit = $this->auditEntries('clients', $this->text($client, 'id'));
        self::assertSame(['create'], array_column($audit, 'action'));
        self::assertSame('CLI-0001', $this->valueAt($audit[0], 'after', 'code'));
        self::assertSame($this->adminId, $this->valueAt($audit[0], 'after', 'responsible_id'));
    }

    public function testValidatesTheFieldsAndTheIdentificationFollowsItsType(): void
    {
        $empty = $this->api('POST', '/clients', $this->adminToken, ['name' => ' ']);
        self::assertSame(['name' => 'required'], $this->errorCodes($empty));

        $bad = $this->api('POST', '/clients', $this->adminToken, [
            'name' => str_repeat('a', 191),
            'identification_type' => 'nit',
            'identification' => '6647912-5',
            'status_id' => 'nope',
            'addresses' => [['label' => '', 'address' => 'x']],
        ]);
        $codes = $this->errorCodes($bad);
        ksort($codes);
        self::assertSame(
            [
                'addresses.0.label' => 'required',
                'identification' => 'invalid',
                'name' => 'too_long',
                'status_id' => 'invalid',
            ],
            $codes,
        );

        $none = $this->api('POST', '/clients', $this->adminToken, [
            'name' => 'X', 'identification_type' => 'none', 'identification' => '123',
        ]);
        self::assertSame(['identification' => 'not_applicable'], $this->errorCodes($none));

        $missing = $this->api('POST', '/clients', $this->adminToken, ['name' => 'X', 'identification_type' => 'cui']);
        self::assertSame(['identification' => 'required'], $this->errorCodes($missing));

        $nit = $this->createClient('Con NIT', ['identification_type' => 'nit', 'identification' => '555-k']);
        self::assertSame('555-K', $nit['identification']);
    }

    public function testCatalogValuesMustBeActive(): void
    {
        $segment = $this->segmentId('Retail');
        $this->connection->executeStatement("UPDATE segments SET deleted_at = NOW(3) WHERE name = 'Retail'");

        $response = $this->api('POST', '/clients', $this->adminToken, ['name' => 'X', 'segment_id' => $segment]);
        self::assertSame(['segment_id' => 'not_found'], $this->errorCodes($response));

        $unknown = $this->api('POST', '/clients', $this->adminToken, [
            'name' => 'X', 'margin_level_id' => '0192a1b2-0000-7000-8000-000000000000',
        ]);
        self::assertSame(['margin_level_id' => 'not_found'], $this->errorCodes($unknown));
    }

    public function testAnActiveIdentificationCannotRepeatAndTheErrorNamesNobody(): void
    {
        $this->createClient('Primero', ['identification_type' => 'nit', 'identification' => '6647912-6']);

        $response = $this->api('POST', '/clients', $this->adminToken, [
            'name' => 'Segundo', 'identification_type' => 'nit', 'identification' => '66479126',
        ]);

        self::assertSame(409, $response->getStatusCode());
        $problem = $this->json($response);
        self::assertSame('identification_taken', $problem['code']);
        self::assertStringNotContainsString('Primero', json_encode($problem, JSON_THROW_ON_ERROR));
        // The failed attempt took no code.
        self::assertSame('CLI-0002', $this->createClient('Tercero')['code']);
    }

    public function testClientsWithoutIdentificationAreAllowedInAnyNumber(): void
    {
        $this->createClient('Uno');
        $this->createClient('Dos');
        $this->createClient('Tres', ['identification_type' => 'none']);

        self::assertSame(3, $this->countRows('SELECT COUNT(*) FROM clients'));
    }

    public function testADeactivatedClientKeepsItsIdentificationReserved(): void
    {
        $inactive = $this->createClient('Dormido', ['identification_type' => 'nit', 'identification' => '12345679']);
        $this->api('POST', '/clients/' . $this->text($inactive, 'id') . '/deactivate', $this->adminToken);

        // An administrator who reaches it is told which one, to reactivate it.
        $admin = $this->api('POST', '/clients', $this->adminToken, [
            'name' => 'Otra vez', 'identification_type' => 'nit', 'identification' => '1234567-9',
        ]);
        self::assertSame(409, $admin->getStatusCode());
        $problem = $this->json($admin);
        self::assertSame('identification_inactive', $problem['code']);
        self::assertSame($inactive['id'], $problem['inactive_client_id']);
        self::assertSame('Dormido', $problem['inactive_client_name']);

        // An adviser without the permission to reactivate only learns that it exists.
        $seller = $this->seller('vendedor@example.com', create: true);
        $limited = $this->api('POST', '/clients', $seller['token'], [
            'name' => 'Otra vez', 'identification_type' => 'nit', 'identification' => '1234567-9',
        ]);
        self::assertSame('identification_inactive', $this->json($limited)['code']);
        self::assertArrayNotHasKey('inactive_client_id', $this->json($limited));
        self::assertStringNotContainsString('Dormido', json_encode($this->json($limited), JSON_THROW_ON_ERROR));

        // The record is reactivated, with its history, instead of registered again.
        $reactivated = $this->api(
            'POST',
            '/clients/' . $this->text($inactive, 'id') . '/reactivate',
            $this->adminToken,
        );
        self::assertTrue($this->json($reactivated)['is_active']);
        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM clients'));
    }

    public function testWhoMayReactivateIsNotToldOfAClientOutsideTheirReach(): void
    {
        $other = $this->seller('otro@example.com', create: true, deactivate: true);
        $mine = $this->seller('mio@example.com', create: true, deactivate: true);
        $theirs = $this->createClient(
            'Ajeno',
            ['identification_type' => 'nit', 'identification' => '12345679'],
            $other['token'],
        );
        $this->api('POST', '/clients/' . $this->text($theirs, 'id') . '/deactivate', $other['token']);

        $response = $this->api('POST', '/clients', $mine['token'], [
            'name' => 'Intento', 'identification_type' => 'nit', 'identification' => '12345679',
        ]);

        $problem = $this->json($response);
        self::assertSame('identification_inactive', $problem['code']);
        self::assertArrayNotHasKey('inactive_client_id', $problem);
        self::assertStringNotContainsString('Ajeno', json_encode($problem, JSON_THROW_ON_ERROR));
    }

    public function testListsOnlyTheClientsOfTheCallersScope(): void
    {
        $ana = $this->seller('ana@example.com', create: true);
        $luis = $this->seller('luis@example.com', create: true);
        $this->createClient('De Ana', [], $ana['token']);
        $this->createClient('De Luis', [], $luis['token']);

        $own = $this->json($this->api('GET', '/clients', $ana['token']));
        self::assertSame(['De Ana'], $this->columnAt($own, 'name', 'data'));
        $all = $this->json($this->api('GET', '/clients?per_page=100', $this->adminToken));
        self::assertSame(['De Ana', 'De Luis'], $this->columnAt($all, 'name', 'data'));
    }

    public function testTheTeamScopeReachesTheClientsOfTheTeam(): void
    {
        $department = $this->createDepartment('Ventas');
        $boss = $this->seller('jefe@example.com', create: true, scope: 'team');
        $member = $this->seller('miembro@example.com', create: true);
        $outsider = $this->seller('fuera@example.com', create: true);
        $this->placeUser($boss['id'], $department);
        $this->placeUser($member['id'], $department);
        $this->createClient('Del equipo', [], $member['token']);
        $this->createClient('De fuera', [], $outsider['token']);
        $this->createClient('Propio', [], $boss['token']);

        $listed = $this->json($this->api('GET', '/clients?per_page=100', $boss['token']));

        self::assertSame(['Del equipo', 'Propio'], $this->columnAt($listed, 'name', 'data'));
    }

    public function testAClientOutsideTheScopeDoesNotExistForTheCaller(): void
    {
        $ana = $this->seller('ana@example.com', create: true, edit: true, deactivate: true);
        $luis = $this->seller('luis@example.com', create: true);
        $id = $this->text($this->createClient('De Luis', [], $luis['token']), 'id');
        $other = $this->seller('otro@example.com', create: true);
        $contact = $this->createContact($other['token'], 'Persona');

        $requests = [
            ['GET', '/clients/' . $id, null],
            ['PATCH', '/clients/' . $id, ['version' => 1, 'name' => 'Robo']],
            [
                'POST',
                '/clients/' . $id . '/convert',
                ['version' => 1, 'identification_type' => 'none', 'billing_profile' => $this->billingProfile()],
            ],
            ['POST', '/clients/' . $id . '/deactivate', null],
            ['POST', '/clients/' . $id . '/reactivate', null],
            ['POST', '/clients/' . $id . '/sellers', ['user_id' => $ana['id']]],
            ['POST', '/clients/' . $id . '/responsible', ['user_id' => $ana['id']]],
            ['POST', '/clients/' . $id . '/reassign', ['from_user_id' => $luis['id'], 'to_user_id' => $ana['id']]],
            ['PUT', '/clients/' . $id . '/contacts/' . $contact, ['contact_type_ids' => [$this->contactTypeId()]]],
            ['DELETE', '/clients/' . $id . '/contacts/' . $contact, null],
        ];
        foreach ($requests as [$method, $path, $body]) {
            $status = $this->api($method, $path, $ana['token'], $body)->getStatusCode();
            self::assertSame(404, $status, $method . ' ' . $path);
        }
        self::assertSame('De Luis', $this->clientName($id));
    }

    public function testSearchesAndFiltersTheList(): void
    {
        $retail = $this->segmentId('Retail');
        $this->createClient('Zeta Retail', [
            'segment_id' => $retail,
            'identification_type' => 'nit',
            'identification' => '6647912-6',
        ]);
        $this->createClient('Alfa Industria');
        $beta = $this->createClient('Beta Deshabilitado');
        $this->api('POST', '/clients/' . $this->text($beta, 'id') . '/deactivate', $this->adminToken);

        $active = $this->json($this->api('GET', '/clients?per_page=100', $this->adminToken));
        self::assertSame(['Alfa Industria', 'Zeta Retail'], $this->columnAt($active, 'name', 'data'));
        $inactive = $this->json($this->api('GET', '/clients?status=inactive', $this->adminToken));
        self::assertSame(['Beta Deshabilitado'], $this->columnAt($inactive, 'name', 'data'));
        $segment = $this->json($this->api('GET', '/clients?segment_id=' . $retail, $this->adminToken));
        self::assertSame(['Zeta Retail'], $this->columnAt($segment, 'name', 'data'));
        $byIdentification = $this->json($this->api('GET', '/clients?q=6647912-6', $this->adminToken));
        self::assertSame(['Zeta Retail'], $this->columnAt($byIdentification, 'name', 'data'));
        $byCode = $this->json($this->api('GET', '/clients?status=all&q=CLI-0002', $this->adminToken));
        self::assertSame(['Alfa Industria'], $this->columnAt($byCode, 'name', 'data'));
        $byType = $this->json($this->api('GET', '/clients?type=customer', $this->adminToken));
        self::assertSame([], $this->columnAt($byType, 'name', 'data'));
        $bySeller = $this->json($this->api('GET', '/clients?seller_id=' . $this->adminId, $this->adminToken));
        self::assertSame(2, $this->valueAt($bySeller, 'meta', 'total'));
    }

    public function testEditsReplaceTheDataAndAuditOnlyWhatChanged(): void
    {
        $client = $this->createClient('Original', [
            'segment_id' => $this->segmentId('Retail'),
            'addresses' => [['label' => 'Oficina', 'address' => 'Calle 1']],
        ]);
        $id = $this->text($client, 'id');

        $edited = $this->api('PATCH', '/clients/' . $id, $this->adminToken, [
            'version' => 1,
            'name' => 'Cambiado',
            'segment_id' => $this->segmentId('Retail'),
            'addresses' => [['label' => 'Oficina', 'address' => 'Calle 1']],
        ]);

        self::assertSame(200, $edited->getStatusCode());
        $body = $this->json($edited);
        self::assertSame('Cambiado', $body['name']);
        self::assertSame(2, $body['version']);
        $audit = $this->auditEntries('clients', $id);
        self::assertSame(['create', 'update'], array_column($audit, 'action'));
        self::assertSame(['name' => 'Original'], $audit[1]['before']);
        self::assertSame(['name' => 'Cambiado'], $audit[1]['after']);

        $cleared = $this->json(
            $this->api('PATCH', '/clients/' . $id, $this->adminToken, ['version' => 2, 'name' => 'Cambiado']),
        );
        self::assertNull($cleared['segment']);
        self::assertSame([], $cleared['addresses']);
    }

    public function testAStaleVersionIsRefusedAndAProspectCannotCarryABillingProfile(): void
    {
        $id = $this->text($this->createClient('X'), 'id');

        $stale = $this->api('PATCH', '/clients/' . $id, $this->adminToken, ['version' => 5, 'name' => 'Y']);
        self::assertSame(409, $stale->getStatusCode());
        self::assertSame('conflict', $this->json($stale)['code']);

        $billing = $this->api('PATCH', '/clients/' . $id, $this->adminToken, [
            'version' => 1,
            'name' => 'Y',
            'billing_profile' => ['legal_name' => 'Y, S.A.', 'tax_regime_id' => $this->taxRegimeId()],
        ]);
        self::assertSame(['billing_profile' => 'not_applicable'], $this->errorCodes($billing));
    }

    public function testAValueSwitchedOffLaterStillWorksForTheClientThatUsesIt(): void
    {
        $segment = $this->segmentId('Retail');
        $id = $this->text($this->createClient('Con segmento', ['segment_id' => $segment]), 'id');
        $this->connection->executeStatement("UPDATE segments SET deleted_at = NOW(3) WHERE name = 'Retail'");

        $kept = $this->api('PATCH', '/clients/' . $id, $this->adminToken, [
            'version' => 1, 'name' => 'Sigue', 'segment_id' => $segment,
        ]);

        self::assertSame(200, $kept->getStatusCode());
        self::assertSame('Retail', $this->valueAt($this->json($kept), 'segment', 'name'));
    }

    public function testConvertsAProspectIntoACustomerWithItsBillingProfile(): void
    {
        $id = $this->text($this->createClient('Por convertir'), 'id');

        $withoutProfile = $this->api('POST', '/clients/' . $id . '/convert', $this->adminToken, [
            'version' => 1, 'identification_type' => 'none',
        ]);
        self::assertSame(['billing_profile' => 'required'], $this->errorCodes($withoutProfile));
        $withoutType = $this->api('POST', '/clients/' . $id . '/convert', $this->adminToken, [
            'version' => 1, 'billing_profile' => $this->billingProfile(),
        ]);
        self::assertSame(['identification_type' => 'required'], $this->errorCodes($withoutType));

        $converted = $this->api('POST', '/clients/' . $id . '/convert', $this->adminToken, [
            'version' => 1,
            'identification_type' => 'nit',
            'identification' => '6647912-6',
            'billing_profile' => $this->billingProfile(['credit_days' => 30, 'credit_limit' => '15000.5']),
        ]);

        self::assertSame(200, $converted->getStatusCode());
        $client = $this->json($converted);
        self::assertSame('customer', $client['type']);
        self::assertSame('6647912-6', $client['identification']);
        self::assertNotNull($client['converted_at']);
        self::assertSame('Por convertir, S.A.', $this->valueAt($client, 'billing_profile', 'legal_name'));
        self::assertSame('General', $this->valueAt($client, 'billing_profile', 'tax_regime', 'name'));
        self::assertSame(30, $this->valueAt($client, 'billing_profile', 'credit_days'));
        self::assertSame('15000.50', $this->valueAt($client, 'billing_profile', 'credit_limit'));
        self::assertSame(['create', 'convert'], array_column($this->auditEntries('clients', $id), 'action'));

        $again = $this->api('POST', '/clients/' . $id . '/convert', $this->adminToken, [
            'version' => 2, 'identification_type' => 'none', 'billing_profile' => $this->billingProfile(),
        ]);
        self::assertSame('already_customer', $this->json($again)['code']);
    }

    public function testConversionChecksTheIdentificationTheCatalogAndTheStateOfTheClient(): void
    {
        $this->createClient('Dueño del NIT', ['identification_type' => 'nit', 'identification' => '6647912-6']);
        $id = $this->text($this->createClient('Quiere el NIT'), 'id');

        $taken = $this->api('POST', '/clients/' . $id . '/convert', $this->adminToken, [
            'version' => 1, 'identification_type' => 'nit', 'identification' => '66479126',
            'billing_profile' => $this->billingProfile(),
        ]);
        self::assertSame('identification_taken', $this->json($taken)['code']);

        $unknownRegime = $this->api('POST', '/clients/' . $id . '/convert', $this->adminToken, [
            'version' => 1, 'identification_type' => 'none',
            'billing_profile' => $this->billingProfile(['tax_regime_id' => '0192a1b2-0000-7000-8000-000000000000']),
        ]);
        self::assertSame(['billing_profile.tax_regime_id' => 'not_found'], $this->errorCodes($unknownRegime));

        $stale = $this->api('POST', '/clients/' . $id . '/convert', $this->adminToken, [
            'version' => 9, 'identification_type' => 'none', 'billing_profile' => $this->billingProfile(),
        ]);
        self::assertSame('conflict', $this->json($stale)['code']);

        $this->api('POST', '/clients/' . $id . '/deactivate', $this->adminToken);
        $inactive = $this->api('POST', '/clients/' . $id . '/convert', $this->adminToken, [
            'version' => 2, 'identification_type' => 'none', 'billing_profile' => $this->billingProfile(),
        ]);
        self::assertSame('client_inactive', $this->json($inactive)['code']);
        self::assertSame(
            'prospect',
            $this->connection->fetchOne("SELECT type FROM clients WHERE name = 'Quiere el NIT'"),
        );
    }

    public function testACustomerNeedsItsBillingProfileWhenEdited(): void
    {
        $id = $this->text($this->customer('Cliente'), 'id');

        $without = $this->api('PATCH', '/clients/' . $id, $this->adminToken, ['version' => 2, 'name' => 'Cliente']);
        self::assertSame(['billing_profile' => 'required'], $this->errorCodes($without));

        $with = $this->api('PATCH', '/clients/' . $id, $this->adminToken, [
            'version' => 2, 'name' => 'Cliente', 'billing_profile' => $this->billingProfile(['credit_days' => 15]),
        ]);
        self::assertSame(200, $with->getStatusCode());
        self::assertSame(15, $this->valueAt($this->json($with), 'billing_profile', 'credit_days'));
    }

    public function testDeactivatingAndReactivatingIsIdempotentAndAudited(): void
    {
        $id = $this->text($this->createClient('Ciclo'), 'id');

        $first = $this->json($this->api('POST', '/clients/' . $id . '/deactivate', $this->adminToken));
        $second = $this->json($this->api('POST', '/clients/' . $id . '/deactivate', $this->adminToken));
        self::assertFalse($first['is_active']);
        self::assertSame($first['version'], $second['version']);
        $reactivated = $this->api('POST', '/clients/' . $id . '/reactivate', $this->adminToken);
        self::assertTrue($this->json($reactivated)['is_active']);
        self::assertSame(
            ['create', 'deactivate', 'reactivate'],
            array_column($this->auditEntries('clients', $id), 'action'),
        );
    }

    public function testWarnsOfSimilarNamesOnlyInsideTheCallersScope(): void
    {
        $ana = $this->seller('ana@example.com', create: true);
        $luis = $this->seller('luis@example.com', create: true);
        $this->createClient('Restaurante El Sol', [], $ana['token']);
        $this->createClient('Restaurante La Luna', [], $luis['token']);

        $mine = $this->json($this->api('GET', '/clients/similar?name=Restaurante', $ana['token']));
        self::assertSame(['Restaurante El Sol'], $this->columnAt($mine, 'name', 'data'));
        $all = $this->json($this->api('GET', '/clients/similar?name=restaurante', $this->adminToken));
        self::assertCount(2, $this->rowsAt($all, 'data'));
        $short = $this->json($this->api('GET', '/clients/similar?name=Re', $this->adminToken));
        self::assertSame([], $this->rowsAt($short, 'data'));
    }

    public function testEachActionNeedsItsPermission(): void
    {
        $viewer = $this->seller('lector@example.com', view: true);
        $id = $this->text($this->createClient('X'), 'id');
        $this->connection->executeStatement(
            'INSERT INTO client_sellers (client_id, user_id, is_responsible) VALUES (UNHEX(:c), UNHEX(:u), 0)',
            ['c' => str_replace('-', '', $id), 'u' => str_replace('-', '', $viewer['id'])],
        );

        self::assertSame(200, $this->api('GET', '/clients', $viewer['token'])->getStatusCode());
        self::assertSame(200, $this->api('GET', '/clients/' . $id, $viewer['token'])->getStatusCode());
        self::assertSame(403, $this->api('POST', '/clients', $viewer['token'], ['name' => 'Y'])->getStatusCode());
        $edit = $this->api('PATCH', '/clients/' . $id, $viewer['token'], ['version' => 1, 'name' => 'Y']);
        self::assertSame(403, $edit->getStatusCode());
        self::assertSame(403, $this->api('POST', '/clients/' . $id . '/deactivate', $viewer['token'])->getStatusCode());
        self::assertSame(403, $this->api('GET', '/clients/similar?name=abc', $viewer['token'])->getStatusCode());
        self::assertSame(401, $this->api('GET', '/clients')->getStatusCode());
    }

    public function testTheMigrationCanBeRepeatedWithoutDuplicatingAnything(): void
    {
        $this->applyMigrationAgain('20261015000001');

        self::assertSame(85, $this->countRows('SELECT COUNT(*) FROM role_permissions'));
        self::assertSame(11, $this->countRows('SELECT COUNT(*) FROM role_scopes'));
        self::assertSame(1, $this->countRows("SELECT COUNT(*) FROM resources WHERE code = 'client_profile'"));
        self::assertSame(
            'external',
            $this->connection->fetchOne("SELECT audience FROM resources WHERE code = 'client_profile'"),
        );
    }

    public function testOnlyOneResponsibleAdviserCanExistPerClientEvenIfTheCodeFails(): void
    {
        $id = $this->text($this->createClient('Único'), 'id');
        $other = $this->createUser('otro@example.com');

        $this->expectException(\Doctrine\DBAL\Exception\UniqueConstraintViolationException::class);
        $this->connection->executeStatement(
            'INSERT INTO client_sellers (client_id, user_id, is_responsible) VALUES (UNHEX(:c), UNHEX(:u), 1)',
            ['c' => str_replace('-', '', $id), 'u' => str_replace('-', '', $other['id'])],
        );
    }
}
