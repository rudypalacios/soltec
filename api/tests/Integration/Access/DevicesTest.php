<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Soltec\Kernel\Uuid;

final class DevicesTest extends AccessTestCase
{
    /**
     * Signs in from a new device the way a browser would.
     *
     * @return array{token: string, deviceId: string, refresh: string}
     */
    private function signIn(string $email, string $deviceName): array
    {
        $response = $this->login($email, body: ['device' => ['platform' => 'web', 'name' => $deviceName]]);
        self::assertSame(200, $response->getStatusCode());
        $body = $this->json($response);

        return [
            'token' => $this->text($body, 'access_token'),
            'deviceId' => $this->text($body, 'device_id'),
            'refresh' => $this->refreshCookieValue($response),
        ];
    }

    /** @return list<string|null> */
    private function deviceNames(string $token): array
    {
        $rows = $this->rowsAt($this->json($this->api('GET', '/me/devices', $token)), 'data');

        return array_map(
            static fn (array $row): ?string => is_string($row['name']) ? $row['name'] : null,
            $rows,
        );
    }

    public function testListsTheOpenSessionsOfTheUserMarkingTheCurrentOne(): void
    {
        $this->createUser('ana@example.com');
        $laptop = $this->signIn('ana@example.com', 'Laptop');
        $this->clock->advance('+5 minutes');
        $phone = $this->signIn('ana@example.com', 'Phone');

        $list = $this->json($this->api('GET', '/me/devices', $phone['token']));

        $rows = $this->rowsAt($list, 'data');
        self::assertSame(['Phone', 'Laptop'], array_column($rows, 'name'), 'Most recently seen first.');
        self::assertSame([true, false], array_column($rows, 'current'));
        self::assertSame($phone['deviceId'], $rows[0]['id']);
        self::assertSame('web', $rows[0]['platform']);
        self::assertNotNull($rows[0]['last_seen_at']);
        self::assertNotNull($rows[0]['created_at']);
        self::assertSame([false, true], array_column(
            $this->rowsAt($this->json($this->api('GET', '/me/devices', $laptop['token'])), 'data'),
            'current',
        ));
    }

    public function testNeverShowsTheDevicesOfAnotherUser(): void
    {
        $this->createUser('ana@example.com');
        $this->createUser('bo@example.com');
        $ana = $this->signIn('ana@example.com', 'Ana laptop');
        $this->signIn('bo@example.com', 'Bo laptop');

        self::assertSame(['Ana laptop'], $this->deviceNames($ana['token']));
    }

    public function testASessionThatEndedIsNotListedButTheCurrentDeviceAlwaysIs(): void
    {
        $this->createUser('ana@example.com');
        $old = $this->signIn('ana@example.com', 'Forgotten browser');
        $this->clock->advance('+2 hours');
        $current = $this->sessionFor($this->userId('ana@example.com'));

        $names = $this->deviceNames($current['token']);

        self::assertNotContains('Forgotten browser', $names, 'Its refresh token expired after 30 minutes.');
        self::assertSame([null], $names, 'The current device has no name here but is always listed.');
        self::assertNotSame($old['deviceId'], $current['deviceId']);
    }

    public function testClosingADeviceEndsItsSessionAtOnce(): void
    {
        $this->createUser('ana@example.com');
        $laptop = $this->signIn('ana@example.com', 'Laptop');
        $phone = $this->signIn('ana@example.com', 'Phone');

        $response = $this->api('DELETE', '/me/devices/' . $laptop['deviceId'], $phone['token']);

        self::assertSame(204, $response->getStatusCode());
        self::assertSame(401, $this->api('GET', '/me', $laptop['token'])->getStatusCode());
        $refresh = $this->call('POST', '/api/v1/auth/refresh', [], null, ['refresh_token' => $laptop['refresh']]);
        self::assertSame(401, $refresh->getStatusCode());
        $untouched = $this->api('GET', '/me', $phone['token']);
        self::assertSame(200, $untouched->getStatusCode(), 'The other one is untouched.');
        self::assertSame(['Phone'], $this->deviceNames($phone['token']));
    }

    public function testClosingTheCurrentDeviceIsTheSameAsSigningOut(): void
    {
        $this->createUser('ana@example.com');
        $laptop = $this->signIn('ana@example.com', 'Laptop');

        $closed = $this->api('DELETE', '/me/devices/' . $laptop['deviceId'], $laptop['token']);
        self::assertSame(204, $closed->getStatusCode());

        self::assertSame(401, $this->api('GET', '/me', $laptop['token'])->getStatusCode());
    }

    public function testADeviceOfAnotherUserCannotBeClosedOrConfirmed(): void
    {
        $this->createUser('ana@example.com');
        $this->createUser('bo@example.com');
        $ana = $this->signIn('ana@example.com', 'Ana laptop');
        $bo = $this->signIn('bo@example.com', 'Bo laptop');

        $foreign = $this->api('DELETE', '/me/devices/' . $bo['deviceId'], $ana['token']);
        $unknown = $this->api('DELETE', '/me/devices/' . Uuid::v7(), $ana['token']);

        self::assertSame(404, $foreign->getStatusCode());
        self::assertSame((string) $unknown->getBody(), (string) $foreign->getBody(), 'Same answer for both.');
        self::assertSame(200, $this->api('GET', '/me', $bo['token'])->getStatusCode());
        self::assertSame([], $this->auditEntries('devices'));
    }

    public function testAnAdministratorCannotCloseSomeoneElsesDeviceThroughThisRoute(): void
    {
        $admin = $this->signInAdmin();
        $this->createUser('ana@example.com');
        $ana = $this->signIn('ana@example.com', 'Ana laptop');

        $response = $this->api('DELETE', '/me/devices/' . $ana['deviceId'], $admin['token']);

        self::assertSame(404, $response->getStatusCode());
        self::assertSame(200, $this->api('GET', '/me', $ana['token'])->getStatusCode());
    }

    public function testClosingAClosedDeviceOrAMalformedIdIsNotFound(): void
    {
        $this->createUser('ana@example.com');
        $laptop = $this->signIn('ana@example.com', 'Laptop');
        $phone = $this->signIn('ana@example.com', 'Phone');
        $this->api('DELETE', '/me/devices/' . $laptop['deviceId'], $phone['token']);

        $again = $this->api('DELETE', '/me/devices/' . $laptop['deviceId'], $phone['token']);
        self::assertSame(404, $again->getStatusCode());
        self::assertSame(404, $this->api('DELETE', '/me/devices/nope', $phone['token'])->getStatusCode());
    }

    public function testClosingADeviceIsAuditedWithWhatItWas(): void
    {
        $user = $this->createUser('ana@example.com');
        $laptop = $this->signIn('ana@example.com', 'Laptop');
        $phone = $this->signIn('ana@example.com', 'Phone');

        $this->api('DELETE', '/me/devices/' . $laptop['deviceId'], $phone['token']);

        $entries = $this->auditEntries('devices', $laptop['deviceId']);
        self::assertCount(1, $entries);
        self::assertSame('device_revoke', $entries[0]['action']);
        self::assertSame($user['id'], $entries[0]['userId']);
        // MySQL's JSON type does not keep the order of the keys.
        self::assertEquals(['platform' => 'web', 'name' => 'Laptop'], $entries[0]['before']);
    }

    public function testNeedsASessionAndAFullOne(): void
    {
        $user = $this->createUser('ana@example.com');

        self::assertSame(401, $this->api('GET', '/me/devices')->getStatusCode());
        self::assertSame(401, $this->api('DELETE', '/me/devices/' . Uuid::v7())->getStatusCode());
        $restricted = $this->tokenFor($user['id'], restricted: true);
        self::assertSame(403, $this->api('GET', '/me/devices', $restricted)->getStatusCode());
    }

    /** @return array{token: string} */
    private function signInAdmin(): array
    {
        $this->createAdmin();

        return ['token' => $this->signIn('admin@example.com', 'Admin laptop')['token']];
    }

    private function userId(string $email): string
    {
        $hex = $this->connection->fetchOne(
            'SELECT LOWER(HEX(id)) FROM users WHERE email = :email',
            ['email' => $email],
        );
        self::assertIsString($hex);

        return Uuid::fromHex($hex);
    }
}
