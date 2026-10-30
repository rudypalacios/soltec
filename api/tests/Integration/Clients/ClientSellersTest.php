<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Clients;

use Soltec\Kernel\Uuid;

/** The advisers of a client, the handover of clients and their people, and the people linked to a client. */
final class ClientSellersTest extends ClientsTestCase
{
    public function testAProspectHasASingleAdviser(): void
    {
        $prospect = $this->createClient('Prospecto');
        $ana = $this->seller('ana@example.com');

        $response = $this->api('POST', '/clients/' . $this->text($prospect, 'id') . '/sellers', $this->adminToken, [
            'user_id' => $ana['id'],
        ]);

        self::assertSame(409, $response->getStatusCode());
        self::assertSame('prospect_single_seller', $this->json($response)['code']);
    }

    public function testTheResponsibleAdviserSharesTheCustomerAndTheSharedAdviserSeesIt(): void
    {
        $owner = $this->seller('dueno@example.com', create: true, edit: true, scope: 'all');
        $ana = $this->seller('ana@example.com');
        $id = $this->text($this->customer('Compartido', [], $owner['token']), 'id');
        self::assertSame([], $this->clientNames($ana['token']));

        $added = $this->api('POST', '/clients/' . $id . '/sellers', $owner['token'], ['user_id' => $ana['id']]);

        self::assertSame(200, $added->getStatusCode());
        $client = $this->json($added);
        self::assertSame(2, $client['seller_count']);
        self::assertSame([true, false], array_column($this->rowsAt($client, 'sellers'), 'is_responsible'));
        self::assertSame(['Compartido'], $this->clientNames($ana['token']));
        self::assertSame(
            ['create', 'convert', 'seller_add'],
            array_column($this->auditEntries('clients', $id), 'action'),
        );

        // Adding the same adviser again changes nothing.
        $this->api('POST', '/clients/' . $id . '/sellers', $owner['token'], ['user_id' => $ana['id']]);
        self::assertSame(2, $this->countRows('SELECT COUNT(*) FROM client_sellers'));
    }

    public function testAnAdviserThatIsNotResponsibleCannotChangeTheAdvisers(): void
    {
        $owner = $this->seller('dueno@example.com', create: true, edit: true, scope: 'all');
        $ana = $this->seller('ana@example.com', edit: true);
        $luis = $this->seller('luis@example.com');
        $id = $this->text($this->customer('Compartido', [], $owner['token']), 'id');
        $this->api('POST', '/clients/' . $id . '/sellers', $owner['token'], ['user_id' => $ana['id']]);

        $add = $this->api('POST', '/clients/' . $id . '/sellers', $ana['token'], ['user_id' => $luis['id']]);
        $remove = $this->api('DELETE', '/clients/' . $id . '/sellers/' . $owner['id'], $ana['token']);
        $responsible = $this->api('POST', '/clients/' . $id . '/responsible', $ana['token'], ['user_id' => $ana['id']]);
        $reassign = $this->api('POST', '/clients/' . $id . '/reassign', $ana['token'], [
            'from_user_id' => $owner['id'], 'to_user_id' => $luis['id'],
        ]);

        foreach ([$add, $remove, $responsible, $reassign] as $response) {
            self::assertSame(403, $response->getStatusCode());
        }
        self::assertSame(2, $this->countRows('SELECT COUNT(*) FROM client_sellers'));
    }

    public function testOnlyAnActiveInternalUserCanBeAnAdviser(): void
    {
        $id = $this->text($this->customer('Cliente'), 'id');
        $inactive = $this->seller('baja@example.com');
        $this->connection->executeStatement(
            'UPDATE users SET deleted_at = NOW(3) WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($inactive['id'])],
        );
        $outsider = $this->text($this->customer('Otro'), 'id');
        $external = $this->externalUser('portal@example.com', $outsider);

        foreach ([$inactive['id'], $external['id'], '0192a1b2-0000-7000-8000-000000000000'] as $userId) {
            $response = $this->api('POST', '/clients/' . $id . '/sellers', $this->adminToken, ['user_id' => $userId]);
            self::assertSame(['user_id' => 'not_found'], $this->errorCodes($response));
        }
    }

    public function testTheResponsibleAdviserCannotBeRemovedButCanBeReplaced(): void
    {
        $id = $this->text($this->customer('Cliente'), 'id');
        $ana = $this->seller('ana@example.com');
        $this->api('POST', '/clients/' . $id . '/sellers', $this->adminToken, ['user_id' => $ana['id']]);

        $blocked = $this->api('DELETE', '/clients/' . $id . '/sellers/' . $this->adminId, $this->adminToken);
        self::assertSame('responsible_required', $this->json($blocked)['code']);

        $notAnAdviser = $this->api('POST', '/clients/' . $id . '/responsible', $this->adminToken, [
            'user_id' => $this->seller('otra@example.com')['id'],
        ]);
        self::assertSame(['user_id' => 'not_found'], $this->errorCodes($notAnAdviser));

        $swapped = $this->json(
            $this->api('POST', '/clients/' . $id . '/responsible', $this->adminToken, ['user_id' => $ana['id']]),
        );
        self::assertSame($ana['id'], $this->valueAt($swapped, 'responsible', 'id'));
        self::assertSame($ana['id'], $this->valueAt($swapped, 'sellers', '0', 'user', 'id'));

        $removed = $this->api('DELETE', '/clients/' . $id . '/sellers/' . $this->adminId, $this->adminToken);
        self::assertSame(1, $this->json($removed)['seller_count']);
        $unknown = $this->api('DELETE', '/clients/' . $id . '/sellers/' . $this->adminId, $this->adminToken);
        self::assertSame(404, $unknown->getStatusCode());
        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM client_sellers WHERE is_responsible = 1'));
    }

    public function testReassigningHandsTheClientAndOnlyItsOwnPeopleToTheNewAdviser(): void
    {
        $ana = $this->seller('ana@example.com', create: true);
        $luis = $this->seller('luis@example.com');
        $first = $this->text($this->createClient('Uno', [], $ana['token']), 'id');
        $second = $this->text($this->createClient('Dos', [], $ana['token']), 'id');
        $onlyHere = $this->createContact($ana['token'], 'Solo en Uno');
        $shared = $this->createContact($ana['token'], 'En Uno y Dos');
        $type = $this->contactTypeId();
        foreach ([[$first, $onlyHere], [$first, $shared], [$second, $shared]] as [$client, $contact]) {
            $this->link($ana['token'], $client, $contact, $type);
        }

        $response = $this->api('POST', '/clients/' . $first . '/reassign', $this->adminToken, [
            'from_user_id' => $ana['id'], 'to_user_id' => $luis['id'],
        ]);

        self::assertSame(200, $response->getStatusCode());
        $body = $this->json($response);
        self::assertSame([1, 1], [$body['contacts_moved'], $body['contacts_kept']]);
        self::assertSame($luis['id'], $this->valueAt($body, 'client', 'responsible', 'id'));
        self::assertSame($luis['id'], $this->contactOwner($onlyHere));
        self::assertSame($ana['id'], $this->contactOwner($shared));
        self::assertSame(['Uno'], $this->clientNames($luis['token']));
        self::assertSame(['Dos'], $this->clientNames($ana['token']));
        $audit = $this->auditEntries('clients', $first);
        self::assertSame(['create', 'contact_link', 'contact_link', 'reassign'], array_column($audit, 'action'));
        self::assertSame(['create', 'update'], array_column($this->auditEntries('contacts', $onlyHere), 'action'));
    }

    public function testReassigningCanLeaveThePeopleWithTheirOwner(): void
    {
        $ana = $this->seller('ana@example.com', create: true);
        $luis = $this->seller('luis@example.com');
        $id = $this->text($this->createClient('Uno', [], $ana['token']), 'id');
        $contact = $this->createContact($ana['token'], 'Persona');
        $this->link($ana['token'], $id, $contact, $this->contactTypeId());

        $body = $this->json($this->api('POST', '/clients/' . $id . '/reassign', $this->adminToken, [
            'from_user_id' => $ana['id'], 'to_user_id' => $luis['id'], 'move_contacts' => false,
        ]));

        self::assertSame([0, 0], [$body['contacts_moved'], $body['contacts_kept']]);
        self::assertSame($ana['id'], $this->contactOwner($contact));
    }

    public function testReassigningToSomeoneWhoAlreadySharesTheClientKeepsOneResponsible(): void
    {
        $id = $this->text($this->customer('Cliente'), 'id');
        $ana = $this->seller('ana@example.com');
        $this->api('POST', '/clients/' . $id . '/sellers', $this->adminToken, ['user_id' => $ana['id']]);

        $body = $this->json($this->api('POST', '/clients/' . $id . '/reassign', $this->adminToken, [
            'from_user_id' => $this->adminId, 'to_user_id' => $ana['id'],
        ]));

        self::assertSame(1, $this->valueAt($body, 'client', 'seller_count'));
        self::assertSame($ana['id'], $this->valueAt($body, 'client', 'responsible', 'id'));
    }

    public function testReassigningValidatesTheUsers(): void
    {
        $id = $this->text($this->customer('Cliente'), 'id');
        $ana = $this->seller('ana@example.com');

        $same = $this->api('POST', '/clients/' . $id . '/reassign', $this->adminToken, [
            'from_user_id' => $ana['id'], 'to_user_id' => $ana['id'],
        ]);
        self::assertSame(['to_user_id' => 'same_user'], $this->errorCodes($same));
        $notAdviser = $this->api('POST', '/clients/' . $id . '/reassign', $this->adminToken, [
            'from_user_id' => $ana['id'], 'to_user_id' => $this->adminId,
        ]);
        self::assertSame(['from_user_id' => 'not_found'], $this->errorCodes($notAdviser));
        $nobody = $this->api('POST', '/clients/' . $id . '/reassign', $this->adminToken, [
            'from_user_id' => $this->adminId, 'to_user_id' => '0192a1b2-0000-7000-8000-000000000000',
        ]);
        self::assertSame(['to_user_id' => 'not_found'], $this->errorCodes($nobody));
        $missing = $this->api('POST', '/clients/' . $id . '/reassign', $this->adminToken, [
            'from_user_id' => $ana['id'],
        ]);
        self::assertSame(['to_user_id' => 'required'], $this->errorCodes($missing));
    }

    public function testHandsOverAWholePortfolioWithThePeopleThatBelongOnlyToIt(): void
    {
        $ana = $this->seller('ana@example.com', create: true);
        $luis = $this->seller('luis@example.com');
        $one = $this->text($this->createClient('Uno', [], $ana['token']), 'id');
        $two = $this->text($this->createClient('Dos', [], $ana['token']), 'id');
        $both = $this->createContact($ana['token'], 'En los dos');
        $type = $this->contactTypeId();
        foreach ([$one, $two] as $client) {
            $this->link($ana['token'], $client, $both, $type);
        }

        $response = $this->api('POST', '/clients/reassign', $this->adminToken, [
            'from_user_id' => $ana['id'], 'to_user_id' => $luis['id'],
        ]);

        self::assertSame(200, $response->getStatusCode());
        // The person belongs to both clients and both go, so they go too.
        self::assertSame(
            ['clients_reassigned' => 2, 'contacts_moved' => 1, 'contacts_kept' => 0],
            $this->json($response),
        );
        self::assertSame($luis['id'], $this->contactOwner($both));
        self::assertSame(0, $this->sellerRows($ana['id']));
    }

    public function testAPersonAlsoLinkedToAClientThatStaysIsNotMovedWithThePortfolio(): void
    {
        $ana = $this->seller('ana@example.com', create: true);
        $luis = $this->seller('luis@example.com');
        $boss = $this->seller('jefe@example.com', edit: true, scope: 'team');
        $department = $this->createDepartment('Ventas');
        $this->placeUser($boss['id'], $department);
        $this->placeUser($ana['id'], $department);
        $this->placeUser($luis['id'], $department);
        $handedOver = $this->text($this->createClient('Se entrega', [], $ana['token']), 'id');
        $otherSeller = $this->seller('otra@example.com', create: true);
        $stays = $this->text($this->createClient('Se queda', [], $otherSeller['token']), 'id');
        $contact = $this->createContact($ana['token'], 'En ambos');
        $this->api('PUT', '/clients/' . $handedOver . '/contacts/' . $contact, $ana['token'], [
            'contact_type_ids' => [$this->contactTypeId()],
        ]);
        // Ana is no adviser of the second client, but the person is still linked to it.
        $this->connection->executeStatement(
            'INSERT INTO client_contacts (client_id, contact_id, contact_type_id) '
            . 'VALUES (UNHEX(:c), UNHEX(:p), UNHEX(:t))',
            ['c' => Uuid::toHex($stays), 'p' => Uuid::toHex($contact), 't' => Uuid::toHex($this->contactTypeId())],
        );

        $response = $this->api('POST', '/clients/reassign', $boss['token'], [
            'from_user_id' => $ana['id'], 'to_user_id' => $luis['id'],
        ]);

        self::assertSame(
            ['clients_reassigned' => 1, 'contacts_moved' => 0, 'contacts_kept' => 1],
            $this->json($response),
        );
        self::assertSame($ana['id'], $this->contactOwner($contact));
        self::assertSame(0, $this->sellerRows($ana['id']));
    }

    public function testAnAdviserWhoOnlyReachesTheirOwnClientsCannotHandOverAPortfolio(): void
    {
        $ana = $this->seller('ana@example.com', create: true, edit: true);
        $luis = $this->seller('luis@example.com');
        $this->createClient('Uno', [], $ana['token']);

        $response = $this->api('POST', '/clients/reassign', $ana['token'], [
            'from_user_id' => $ana['id'], 'to_user_id' => $luis['id'],
        ]);

        self::assertSame(403, $response->getStatusCode());
        self::assertSame(1, $this->sellerRows($ana['id']));
    }

    public function testAnAdviserWhoIsTheResponsibleOfActiveClientsCannotBeDeactivatedUntilTheyAreHandedOver(): void
    {
        $ana = $this->seller('ana@example.com', create: true);
        $luis = $this->seller('luis@example.com');
        $this->createClient('Uno', [], $ana['token']);
        $this->createClient('Dos', [], $ana['token']);
        $inactive = $this->text($this->createClient('Tres', [], $ana['token']), 'id');
        $this->api('POST', '/clients/' . $inactive . '/deactivate', $this->adminToken);

        $blocked = $this->api('POST', '/users/' . $ana['id'] . '/deactivate', $this->adminToken);

        self::assertSame(409, $blocked->getStatusCode());
        $problem = $this->json($blocked);
        self::assertSame('user_has_clients', $problem['code']);
        self::assertSame(2, $problem['active_client_count']);

        $this->api('POST', '/clients/reassign', $this->adminToken, [
            'from_user_id' => $ana['id'],
            'to_user_id' => $luis['id'],
        ]);
        $deactivated = $this->api('POST', '/users/' . $ana['id'] . '/deactivate', $this->adminToken);
        self::assertSame(200, $deactivated->getStatusCode());
    }

    public function testAMarginLevelUsedByActiveClientsCannotBeDeactivated(): void
    {
        $levelId = $this->text($this->json($this->api('POST', '/margin-levels', $this->adminToken, [
            'name' => 'Especial', 'rate' => '0.40',
        ])), 'id');
        $client = $this->text($this->createClient('Con margen', ['margin_level_id' => $levelId]), 'id');

        $blocked = $this->api('POST', '/margin-levels/' . $levelId . '/deactivate', $this->adminToken);

        self::assertSame(409, $blocked->getStatusCode());
        self::assertSame('margin_level_in_use', $this->json($blocked)['code']);
        self::assertSame(1, $this->json($blocked)['active_client_count']);

        $this->api('POST', '/clients/' . $client . '/deactivate', $this->adminToken);
        $deactivated = $this->api('POST', '/margin-levels/' . $levelId . '/deactivate', $this->adminToken);
        self::assertSame(200, $deactivated->getStatusCode());
    }

    public function testLinksAPersonWithRolesAndOnlyTheirOwnerSeesThemOnTheClient(): void
    {
        $ana = $this->seller('ana@example.com', create: true, edit: true, scope: 'all');
        $luis = $this->seller('luis@example.com');
        $id = $this->text($this->customer('Compartido', [], $ana['token']), 'id');
        $this->api('POST', '/clients/' . $id . '/sellers', $ana['token'], ['user_id' => $luis['id']]);
        $person = $this->createContact($ana['token'], 'Gerente');
        $commercial = $this->contactTypeId();
        $billing = $this->contactTypeId('Facturación');

        $linked = $this->api('PUT', '/clients/' . $id . '/contacts/' . $person, $ana['token'], [
            'contact_type_ids' => [$commercial, $billing],
        ]);

        self::assertSame(200, $linked->getStatusCode());
        $contacts = $this->rowsAt($this->json($linked), 'contacts');
        self::assertSame(['Comercial', 'Facturación'], $this->roleNames($contacts));
        self::assertSame('Gerente', $this->text($contacts[0], 'contact', 'name'));
        // The other adviser of the client does not see the person, nor can reach them by id.
        $theirs = $this->json($this->api('GET', '/clients/' . $id, $luis['token']));
        self::assertSame([], $theirs['contacts']);
        self::assertSame(404, $this->api('GET', '/contacts/' . $person, $luis['token'])->getStatusCode());
        // An administrator sees every person.
        $seenByAdmin = $this->json($this->api('GET', '/clients/' . $id, $this->adminToken));
        self::assertCount(2, $this->rowsAt($seenByAdmin, 'contacts'));
    }

    public function testRolesAreReplacedAsASetAndAnUnchangedSetIsNotAudited(): void
    {
        $id = $this->text($this->createClient('Cliente'), 'id');
        $person = $this->createContact($this->adminToken, 'Persona');
        $path = '/clients/' . $id . '/contacts/' . $person;
        $this->api('PUT', $path, $this->adminToken, ['contact_type_ids' => [$this->contactTypeId()]]);

        $same = $this->api('PUT', $path, $this->adminToken, ['contact_type_ids' => [$this->contactTypeId()]]);
        $changed = $this->json($this->api('PUT', $path, $this->adminToken, [
            'contact_type_ids' => [$this->contactTypeId('Compras')],
        ]));

        self::assertSame(200, $same->getStatusCode());
        self::assertSame(['Compras'], $this->roleNames($this->rowsAt($changed, 'contacts')));
        self::assertSame(
            ['create', 'contact_link', 'contact_link'],
            array_column($this->auditEntries('clients', $id), 'action'),
        );
    }

    public function testOnlyActiveContactTypesAreAcceptedExceptOneThePersonAlreadyHad(): void
    {
        $id = $this->text($this->createClient('Cliente'), 'id');
        $person = $this->createContact($this->adminToken, 'Persona');
        $path = '/clients/' . $id . '/contacts/' . $person;
        $kept = $this->contactTypeId('Compras');
        $this->api('PUT', $path, $this->adminToken, ['contact_type_ids' => [$kept]]);
        $this->connection->executeStatement(
            "UPDATE contact_types SET deleted_at = NOW(3) WHERE name IN ('Compras', 'Facturación')",
        );

        $rejected = $this->api('PUT', $path, $this->adminToken, [
            'contact_type_ids' => [$this->contactTypeId('Facturación')],
        ]);
        self::assertSame(['contact_type_ids.0' => 'not_found'], $this->errorCodes($rejected));
        $stillOk = $this->api('PUT', $path, $this->adminToken, ['contact_type_ids' => [$kept]]);
        self::assertSame(200, $stillOk->getStatusCode());
        $empty = $this->api('PUT', $path, $this->adminToken, ['contact_type_ids' => []]);
        self::assertSame(['contact_type_ids' => 'required'], $this->errorCodes($empty));
    }

    public function testAPersonOutsideTheCallersContactsCannotBeLinkedAndNeedsContactsView(): void
    {
        $ana = $this->seller('ana@example.com', create: true, edit: true);
        $noContacts = $this->seller('sin@example.com', create: true, edit: true, contacts: false);
        $luis = $this->seller('luis@example.com', create: true);
        $id = $this->text($this->createClient('De Ana', [], $ana['token']), 'id');
        $mine = $this->text($this->createClient('Sin contactos', [], $noContacts['token']), 'id');
        $theirPerson = $this->createContact($luis['token'], 'De Luis');
        $body = ['contact_type_ids' => [$this->contactTypeId()]];

        $outside = $this->api('PUT', '/clients/' . $id . '/contacts/' . $theirPerson, $ana['token'], $body);
        self::assertSame(404, $outside->getStatusCode());
        $forbidden = $this->api('PUT', '/clients/' . $mine . '/contacts/' . $theirPerson, $noContacts['token'], $body);
        self::assertSame(403, $forbidden->getStatusCode());
        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM client_contacts'));
    }

    public function testUnlinkingIsIdempotentAndNeverDeletesThePerson(): void
    {
        $id = $this->text($this->createClient('Cliente'), 'id');
        $person = $this->createContact($this->adminToken, 'Persona');
        $path = '/clients/' . $id . '/contacts/' . $person;
        $this->link($this->adminToken, $id, $person, $this->contactTypeId(), $this->contactTypeId('Compras'));

        $first = $this->api('DELETE', $path, $this->adminToken);
        $second = $this->api('DELETE', $path, $this->adminToken);

        self::assertSame([], $this->json($first)['contacts']);
        self::assertSame(200, $second->getStatusCode());
        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM contacts'));
        self::assertSame(
            ['create', 'contact_link', 'contact_unlink'],
            array_column($this->auditEntries('clients', $id), 'action'),
        );
    }

    public function testTheSellerOptionsListTheActiveInternalUsersTheScopeReaches(): void
    {
        $viewer = $this->seller('lector@example.com');
        $boss = $this->seller('jefe@example.com', scope: 'team');
        $member = $this->seller('miembro@example.com');
        $all = $this->seller('todo@example.com', scope: 'all');
        $this->seller('baja@example.com');
        $this->connection->executeStatement("UPDATE users SET deleted_at = NOW(3) WHERE email = 'baja@example.com'");
        $department = $this->createDepartment('Ventas');
        $this->placeUser($boss['id'], $department);
        $this->placeUser($member['id'], $department);
        $client = $this->text($this->createClient('X'), 'id');
        $this->externalUser('portal@example.com', $client);
        // Active internal users only, and only the people the caller can hand a client to: nobody else with `own`,
        // the team with `team` and everybody with `all`.
        self::assertSame(['Lector'], $this->sellerOptionNames($viewer['token']));
        self::assertSame(['Jefe', 'Miembro'], $this->sellerOptionNames($boss['token']));
        self::assertSame(
            ['Admin', 'Jefe', 'Lector', 'Miembro', 'Todo'],
            $this->sellerOptionNames($all['token']),
        );
    }

    public function testAClientCannotBeHandedToSomeoneOutsideTheScopeOfWhoHandsItOver(): void
    {
        $owner = $this->seller('dueno@example.com', create: true, edit: true);
        $boss = $this->seller('jefe@example.com', create: true, edit: true, scope: 'team');
        $member = $this->seller('miembro@example.com');
        $outsider = $this->seller('fuera@example.com');
        $department = $this->createDepartment('Ventas');
        $this->placeUser($boss['id'], $department);
        $this->placeUser($member['id'], $department);
        $own = $this->text($this->createClient('Del dueño', [], $owner['token']), 'id');
        $team = $this->text($this->createClient('Del equipo', [], $boss['token']), 'id');

        // With scope `own` there is nobody to hand the client to, so a seller asks their boss.
        $refused = $this->api('POST', '/clients/' . $own . '/reassign', $owner['token'], [
            'from_user_id' => $owner['id'], 'to_user_id' => $outsider['id'],
        ]);
        // With `team`, a member of the team is fine and an outsider is not.
        $inside = $this->api('POST', '/clients/' . $team . '/reassign', $boss['token'], [
            'from_user_id' => $boss['id'], 'to_user_id' => $member['id'],
        ]);
        $outside = $this->api('POST', '/clients/' . $team . '/reassign', $boss['token'], [
            'from_user_id' => $member['id'], 'to_user_id' => $outsider['id'],
        ]);

        self::assertSame(422, $refused->getStatusCode());
        self::assertSame(['to_user_id' => 'out_of_scope'], $this->errorCodes($refused));
        self::assertSame(200, $inside->getStatusCode());
        self::assertSame(422, $outside->getStatusCode());
        self::assertSame(['to_user_id' => 'out_of_scope'], $this->errorCodes($outside));
        // The administrator reaches everybody.
        $byAdmin = $this->api('POST', '/clients/' . $own . '/reassign', $this->adminToken, [
            'from_user_id' => $owner['id'], 'to_user_id' => $outsider['id'],
        ]);
        self::assertSame(200, $byAdmin->getStatusCode());
    }

    /** @return list<string> the names `seller-options` offers to this session */
    private function sellerOptionNames(string $token): array
    {
        return $this->columnAt(
            $this->json($this->api('GET', '/clients/seller-options?limit=100', $token)),
            'name',
            'data',
        );
    }

    /**
     * @param list<array<string, mixed>> $contacts the contacts of a client
     * @return list<string> the name of the role of each link
     */
    private function roleNames(array $contacts): array
    {
        return array_map(fn (array $link): string => $this->text($link, 'contact_type', 'name'), $contacts);
    }
}
