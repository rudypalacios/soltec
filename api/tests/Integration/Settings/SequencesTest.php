<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Settings;

use Doctrine\DBAL\Connection;
use Soltec\Modules\Settings\Application\SequenceGenerator;

final class SequencesTest extends SettingsTestCase
{
    /**
     * @param array<string, mixed> $changes
     * @return array<string, mixed>
     */
    private function body(array $changes = []): array
    {
        return $changes + ['version' => 1, 'prefix' => 'COT', 'padding' => 4, 'period' => 'month', 'next_value' => 1];
    }

    /** @return array<string, mixed> */
    private function sequence(string $code): array
    {
        foreach ($this->rowsAt($this->json($this->api('GET', '/sequences', $this->adminToken)), 'data') as $row) {
            if ($row['code'] === $code) {
                return $row;
            }
        }
        self::fail('No sequence ' . $code);
    }

    public function testListsTheSeededSequencesWithTheirNextNumber(): void
    {
        $list = $this->json($this->api('GET', '/sequences', $this->adminToken));

        self::assertSame(
            ['client', 'contact', 'quote', 'purchase_order', 'bundle', 'product', 'supplier', 'project'],
            $this->columnAt($list, 'code', 'data'),
            'Ordered by name: Clientes, Contactos, Cotizaciones, Órdenes de compra, Paquetes, Productos, '
                . 'Proveedores, Proyectos.',
        );
        self::assertSame('CLI-0001', $this->sequence('client')['example']);
        self::assertSame('COT-2610-0001', $this->sequence('quote')['example'], 'October 2026 in the fixed clock.');
        self::assertFalse($this->sequence('quote')['period_locked']);
    }

    public function testChangesTheRuleAndAuditsIt(): void
    {
        $response = $this->api('PATCH', '/sequences/quote', $this->adminToken, $this->body([
            'prefix' => 'cot', 'padding' => 5, 'period' => 'year', 'next_value' => 100,
        ]));

        self::assertSame(200, $response->getStatusCode());
        $sequence = $this->json($response);
        self::assertSame('COT', $sequence['prefix'], 'Stored in upper case.');
        self::assertSame('COT-2026-00100', $sequence['example']);
        self::assertSame(2, $sequence['version']);

        $audit = $this->auditEntries('sequences');
        self::assertCount(1, $audit);
        self::assertNull($audit[0]['entityId'], 'The key is a code, so the entry carries it in the data.');
        // MySQL's JSON type stores keys in its own order, so only the content is compared.
        $before = ['code' => 'quote', 'padding' => 4, 'period' => 'month', 'next_value' => 1];
        $after = ['code' => 'quote', 'padding' => 5, 'period' => 'year', 'next_value' => 100];
        self::assertEquals($before, $audit[0]['before']);
        self::assertEquals($after, $audit[0]['after']);
    }

    public function testTheCounterCanOnlyGoUp(): void
    {
        $raise = $this->body(['prefix' => 'CLI', 'period' => 'none', 'next_value' => 50]);
        $this->api('PATCH', '/sequences/client', $this->adminToken, $raise);

        $down = $this->api('PATCH', '/sequences/client', $this->adminToken, $this->body([
            'version' => 2, 'prefix' => 'CLI', 'period' => 'none', 'next_value' => 10,
        ]));

        self::assertSame(['next_value' => 'too_low'], $this->errorCodes($down));
    }

    public function testThePeriodIsLockedOnceANumberWasIssued(): void
    {
        $this->service(Connection::class)->transactional(
            fn () => $this->service(SequenceGenerator::class)->next('quote'),
        );

        $response = $this->api('PATCH', '/sequences/quote', $this->adminToken, $this->body([
            'period' => 'none', 'next_value' => 2,
        ]));

        self::assertSame(['period' => 'locked'], $this->errorCodes($response));
        self::assertTrue($this->sequence('quote')['period_locked']);

        $rename = $this->body(['prefix' => 'COTZ', 'next_value' => 2]);
        $prefixOnly = $this->api('PATCH', '/sequences/quote', $this->adminToken, $rename);
        self::assertSame(200, $prefixOnly->getStatusCode(), 'Prefix and padding stay editable.');
    }

    public function testValidatesTheFields(): void
    {
        $body = $this->body(['prefix' => 'a-b', 'padding' => 11, 'period' => 'week', 'next_value' => 0]);

        $errors = $this->errorCodes($this->api('PATCH', '/sequences/quote', $this->adminToken, $body));

        self::assertSame(
            ['prefix' => 'invalid', 'padding' => 'out_of_range', 'period' => 'invalid', 'next_value' => 'out_of_range'],
            $errors,
        );
    }

    public function testRejectsAStaleVersionAnUnknownCodeAndAMissingPermission(): void
    {
        $this->api('PATCH', '/sequences/quote', $this->adminToken, $this->body(['prefix' => 'QT']));

        $other = $this->body(['prefix' => 'QX']);
        self::assertSame(409, $this->statusOf('PATCH', '/sequences/quote', $this->adminToken, $other));
        self::assertSame(404, $this->statusOf('PATCH', '/sequences/nothing', $this->adminToken, $this->body()));
        self::assertSame(404, $this->statusOf('PATCH', '/sequences/Bad-Code', $this->adminToken, $this->body()));
        $viewer = $this->tokenWith('sequences', 'view');
        self::assertSame(200, $this->statusOf('GET', '/sequences', $viewer));
        self::assertSame(403, $this->statusOf('PATCH', '/sequences/quote', $viewer, $this->body(['version' => 2])));
    }
}
