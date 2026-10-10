<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Settings;

use Doctrine\DBAL\Exception\UniqueConstraintViolationException;

final class MarginLevelsTest extends SettingsTestCase
{
    /** @return list<array<string, mixed>> */
    private function levels(string $query = ''): array
    {
        return $this->rowsAt($this->json($this->api('GET', '/margin-levels' . $query, $this->adminToken)), 'data');
    }

    /** @return array<string, mixed> */
    private function create(string $name, string $rate): array
    {
        $response = $this->api('POST', '/margin-levels', $this->adminToken, ['name' => $name, 'rate' => $rate]);
        self::assertSame(201, $response->getStatusCode());

        return $this->json($response);
    }

    private function idOf(string $name): string
    {
        foreach ($this->levels('?status=all') as $level) {
            if ($level['name'] === $name) {
                return $this->text($level, 'id');
            }
        }
        self::fail("No margin level named $name.");
    }

    public function testStartsWithTheTwoSeededLevelsAndOneDefault(): void
    {
        $levels = $this->levels();

        self::assertSame(['Margen 33 %', 'Margen 35 %'], array_column($levels, 'name'));
        self::assertSame(['0.33000', '0.35000'], array_column($levels, 'rate'));
        self::assertSame([true, false], array_column($levels, 'is_default'));
    }

    public function testListsLevelsByMarginAscendingWhateverTheOrderTheyWereCreatedIn(): void
    {
        $this->create('Alto', '0.5');
        $this->create('Bajo', '0.1');
        $this->create('Medio B', '0.4');
        $this->create('Medio A', '0.4');

        self::assertSame(
            ['Bajo', 'Margen 33 %', 'Margen 35 %', 'Medio A', 'Medio B', 'Alto'],
            array_column($this->levels(), 'name'),
            'By margin, then by name.',
        );
        // The inactive ones keep the same order.
        $this->api('POST', '/margin-levels/' . $this->idOf('Bajo') . '/deactivate', $this->adminToken);
        $this->api('POST', '/margin-levels/' . $this->idOf('Alto') . '/deactivate', $this->adminToken);
        self::assertSame(['Bajo', 'Alto'], array_column($this->levels('?status=inactive'), 'name'));
    }

    public function testCreatesALevelThatIsNotTheDefaultAndAuditsIt(): void
    {
        $level = $this->create('  Mayorista  ', '0.2');

        self::assertSame('Mayorista', $level['name']);
        self::assertSame('0.20000', $level['rate']);
        self::assertFalse($level['is_default']);
        self::assertTrue($level['is_active']);
        self::assertSame(1, $level['version']);

        $audit = $this->auditEntries('margin_levels', $this->text($level, 'id'));
        self::assertCount(1, $audit);
        // JSON columns do not keep key order, so the entry is compared as a set of pairs.
        self::assertEquals(
            ['name' => 'Mayorista', 'rate' => '0.20000', 'is_default' => false, 'is_active' => true],
            $audit[0]['after'],
        );
    }

    public function testNameAndRateAreValidated(): void
    {
        $response = $this->api('POST', '/margin-levels', $this->adminToken, ['name' => ' ', 'rate' => '1']);
        self::assertSame(['name' => 'required', 'rate' => 'out_of_range'], $this->errorCodes($response));

        $response = $this->api('POST', '/margin-levels', $this->adminToken, ['name' => 'X', 'rate' => 0.3]);
        self::assertSame(['rate' => 'invalid'], $this->errorCodes($response));

        $tooLong = ['name' => str_repeat('a', 61), 'rate' => '0'];
        $response = $this->api('POST', '/margin-levels', $this->adminToken, $tooLong);
        self::assertSame(['name' => 'too_long'], $this->errorCodes($response));

        $zero = ['name' => 'Cero', 'rate' => '0'];
        self::assertSame(201, $this->statusOf('POST', '/margin-levels', $this->adminToken, $zero));
    }

    public function testTheNameIsUniqueAmongActiveLevelsOnly(): void
    {
        $duplicate = ['name' => 'Margen 33 %', 'rate' => '0.5'];
        $response = $this->api('POST', '/margin-levels', $this->adminToken, $duplicate);
        self::assertSame(['name' => 'taken'], $this->errorCodes($response));

        $spare = $this->create('Temporal', '0.4');
        $this->api('POST', '/margin-levels/' . $this->text($spare, 'id') . '/deactivate', $this->adminToken);
        $again = ['name' => 'Temporal', 'rate' => '0.4'];
        self::assertSame(201, $this->statusOf('POST', '/margin-levels', $this->adminToken, $again));

        // Reactivating the old one now collides with the new active level of the same name.
        $reactivate = $this->api(
            'POST',
            '/margin-levels/' . $this->text($spare, 'id') . '/reactivate',
            $this->adminToken,
        );
        self::assertSame(['name' => 'taken'], $this->errorCodes($reactivate));
    }

    public function testEditsNameAndRateWithTheVersionAndAuditsOnlyWhatChanged(): void
    {
        $id = $this->idOf('Margen 35 %');

        $response = $this->api('PATCH', '/margin-levels/' . $id, $this->adminToken, [
            'version' => 1,
            'name' => 'Margen 35 %',
            'rate' => '0.36',
        ]);

        self::assertSame(200, $response->getStatusCode());
        $level = $this->json($response);
        self::assertSame('0.36000', $level['rate']);
        self::assertSame(2, $level['version']);
        $audit = $this->auditEntries('margin_levels', $id);
        self::assertCount(1, $audit);
        self::assertSame(['rate' => '0.35000'], $audit[0]['before']);
        self::assertSame(['rate' => '0.36000'], $audit[0]['after']);

        $stale = $this->api('PATCH', '/margin-levels/' . $id, $this->adminToken, [
            'version' => 1,
            'name' => 'Otro',
            'rate' => '0.36',
        ]);
        self::assertSame(409, $stale->getStatusCode());
        self::assertSame('conflict', $this->json($stale)['code']);
    }

    public function testSetDefaultMovesTheDefaultAtomicallyAndIsIdempotent(): void
    {
        $other = $this->idOf('Margen 35 %');

        $response = $this->api('POST', "/margin-levels/$other/set-default", $this->adminToken);

        self::assertSame(200, $response->getStatusCode());
        self::assertTrue($this->json($response)['is_default']);
        self::assertSame([false, true], array_column($this->levels(), 'is_default'));
        self::assertCount(2, $this->auditEntries('margin_levels'));

        $again = $this->api('POST', "/margin-levels/$other/set-default", $this->adminToken);
        self::assertSame(200, $again->getStatusCode());
        self::assertCount(2, $this->auditEntries('margin_levels'), 'Repeating it records nothing.');
    }

    public function testADeactivatedLevelCannotBeTheDefault(): void
    {
        $spare = $this->text($this->create('Temporal', '0.4'), 'id');
        $this->api('POST', "/margin-levels/$spare/deactivate", $this->adminToken);

        $response = $this->api('POST', "/margin-levels/$spare/set-default", $this->adminToken);

        self::assertSame(409, $response->getStatusCode());
        self::assertSame('conflict', $this->json($response)['code']);
    }

    public function testTheDefaultLevelCannotBeDeactivatedUntilAnotherTakesOver(): void
    {
        $default = $this->idOf('Margen 33 %');
        $other = $this->idOf('Margen 35 %');

        $refused = $this->api('POST', "/margin-levels/$default/deactivate", $this->adminToken);
        self::assertSame(409, $refused->getStatusCode());
        self::assertSame('default_margin_level', $this->json($refused)['code']);
        self::assertCount(2, $this->levels());

        $this->api('POST', "/margin-levels/$other/set-default", $this->adminToken);
        $done = $this->api('POST', "/margin-levels/$default/deactivate", $this->adminToken);
        self::assertSame(200, $done->getStatusCode());
        self::assertFalse($this->json($done)['is_active']);
        self::assertSame(['Margen 35 %'], array_column($this->levels(), 'name'));
        self::assertSame(['Margen 33 %'], array_column($this->levels('?status=inactive'), 'name'));
    }

    public function testDeactivateAndReactivateAreIdempotentAndAudited(): void
    {
        $id = $this->text($this->create('Temporal', '0.4'), 'id');

        $this->api('POST', "/margin-levels/$id/deactivate", $this->adminToken);
        $this->api('POST', "/margin-levels/$id/deactivate", $this->adminToken);
        $this->api('POST', "/margin-levels/$id/reactivate", $this->adminToken);
        $reactivated = $this->api('POST', "/margin-levels/$id/reactivate", $this->adminToken);

        self::assertTrue($this->json($reactivated)['is_active']);
        self::assertSame(
            ['create', 'deactivate', 'reactivate'],
            array_column($this->auditEntries('margin_levels', $id), 'action'),
        );
    }

    public function testUnknownIdsAnswerNotFound(): void
    {
        $missing = '0190a000-0000-7000-8000-000000000000';

        foreach (['GET', 'PATCH', 'POST'] as $method) {
            $path = $method === 'POST' ? "/margin-levels/$missing/set-default" : "/margin-levels/$missing";
            $body = $method === 'PATCH' ? ['version' => 1, 'name' => 'X', 'rate' => '0.1'] : null;
            self::assertSame(404, $this->statusOf($method, $path, $this->adminToken, $body), $method);
        }
        self::assertSame(404, $this->statusOf('GET', '/margin-levels/not-a-uuid', $this->adminToken));
    }

    public function testEveryVerbIsGovernedByTheRolePermissions(): void
    {
        $id = $this->idOf('Margen 35 %');
        $viewer = $this->tokenWith('margin_levels', 'view');
        $editor = $this->tokenWith('margin_levels', 'view', 'edit');

        self::assertSame(200, $this->statusOf('GET', '/margin-levels', $viewer));
        self::assertSame(401, $this->statusOf('GET', '/margin-levels'));
        $create = ['name' => 'Nuevo', 'rate' => '0.1'];
        self::assertSame(403, $this->statusOf('POST', '/margin-levels', $viewer, $create));
        self::assertSame(403, $this->statusOf('POST', "/margin-levels/$id/set-default", $viewer));
        self::assertSame(403, $this->statusOf('POST', "/margin-levels/$id/deactivate", $editor));
        self::assertSame(403, $this->statusOf('POST', "/margin-levels/$id/reactivate", $editor));
        self::assertSame(200, $this->statusOf('POST', "/margin-levels/$id/set-default", $editor));
        self::assertSame(403, $this->statusOf('GET', '/margin-levels', $this->tokenWith('roles', 'view')));
    }

    public function testTheDatabaseKeepsASingleActiveDefault(): void
    {
        $other = $this->idOf('Margen 35 %');

        try {
            $this->connection->executeStatement(
                'UPDATE margin_levels SET is_default = 1 WHERE id = UNHEX(:id)',
                ['id' => str_replace('-', '', $other)],
            );
            self::fail('Two active levels cannot both be the default.');
        } catch (UniqueConstraintViolationException) {
            // Expected: the generated default_marker column carries the unique index.
        }
    }
}
