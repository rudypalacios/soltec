<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Clients;

/** The advisers of a client are told when they are added to it or taken off it, and never of what they did. */
final class ClientNoticesTest extends ClientsTestCase
{
    public function testAddingAnAdviserTellsThemAndTheLinkOpensTheClient(): void
    {
        $owner = $this->seller('dueno@example.com', create: true, edit: true, scope: 'all');
        $ana = $this->seller('ana@example.com');
        $id = $this->text($this->customer('Compartido', [], $owner['token']), 'id');

        $this->api('POST', '/clients/' . $id . '/sellers', $owner['token'], ['user_id' => $ana['id']]);

        self::assertSame(['client_seller_added'], $this->typesFor($ana));
        self::assertSame([], $this->typesFor($owner));
        $notice = $this->notices($ana)[0];
        self::assertSame('client', $this->text($notice, 'subject', 'type'));
        self::assertSame($id, $this->text($notice, 'subject', 'id'));
        self::assertSame('Compartido', $this->text($notice, 'subject', 'title'));
        self::assertCount(1, $this->mail->sent);
        self::assertStringContainsString('https://app.example.test/clientes/' . $id, $this->mail->sent[0]->body);

        // Adding the same adviser again changes nothing and tells nobody twice.
        $this->api('POST', '/clients/' . $id . '/sellers', $owner['token'], ['user_id' => $ana['id']]);
        self::assertSame(['client_seller_added'], $this->typesFor($ana));
    }

    public function testRemovingAnAdviserTellsThem(): void
    {
        $owner = $this->seller('dueno@example.com', create: true, edit: true, scope: 'all');
        $ana = $this->seller('ana@example.com');
        $id = $this->text($this->customer('Compartido', [], $owner['token']), 'id');
        $this->api('POST', '/clients/' . $id . '/sellers', $owner['token'], ['user_id' => $ana['id']]);

        $this->api('DELETE', '/clients/' . $id . '/sellers/' . $ana['id'], $owner['token']);

        self::assertSame(['client_seller_removed', 'client_seller_added'], $this->typesFor($ana));
    }

    public function testHandingOverTheClientsOfAnAdviserTellsBothSidesOnceForEachClient(): void
    {
        $from = $this->seller('desde@example.com', create: true, edit: true, scope: 'all');
        $to = $this->seller('hacia@example.com');
        $this->customer('Uno', [], $from['token']);
        $this->customer('Dos', [], $from['token']);

        $response = $this->api('POST', '/clients/reassign', $this->adminToken, [
            'from_user_id' => $from['id'],
            'to_user_id' => $to['id'],
            'move_contacts' => false,
        ]);

        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(['client_seller_added', 'client_seller_added'], $this->typesFor($to));
        self::assertSame(['client_seller_removed', 'client_seller_removed'], $this->typesFor($from));
    }

    /**
     * @param array{id: string, token: string} $person
     * @return list<string>
     */
    private function typesFor(array $person): array
    {
        return array_map(fn (array $notice): string => $this->text($notice, 'type'), $this->notices($person));
    }

    /**
     * @param array{id: string, token: string} $person
     * @return list<array<string, mixed>>
     */
    private function notices(array $person): array
    {
        return $this->rowsAt($this->json($this->api('GET', '/notifications', $person['token'])), 'data');
    }
}
