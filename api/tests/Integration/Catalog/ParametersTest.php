<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Catalog;

use PHPUnit\Framework\Attributes\DataProvider;
use Soltec\Tests\Integration\Access\AccessTestCase;

/** The five catalog parameters share one implementation, so each behavior is checked against every one of them. */
final class ParametersTest extends AccessTestCase
{
    private string $adminToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminToken = $this->tokenFor($this->createAdmin()['id']);
    }

    /** @return array<string, array{string, string, string}> slug, table, id placeholder */
    public static function parameters(): array
    {
        return [
            'contact types' => ['contact-types', 'contact_types', 'contactTypeId'],
            'client statuses' => ['client-statuses', 'client_statuses', 'clientStatusId'],
            'segments' => ['segments', 'segments', 'segmentId'],
            'tax regimes' => ['tax-regimes', 'tax_regimes', 'taxRegimeId'],
            'payment methods' => ['payment-methods', 'payment_methods', 'paymentMethodId'],
        ];
    }

    public function testTheMigrationSeedsTheStartingValues(): void
    {
        $names = fn (string $slug): array => $this->columnAt(
            $this->json($this->api('GET', '/' . $slug . '?per_page=100', $this->adminToken)),
            'name',
            'data',
        );

        self::assertSame(['Comercial', 'Compras', 'Facturación'], $names('contact-types'));
        self::assertSame(
            [
                'Activo (nuevo)', 'Activo (recurrente)', 'En riesgo / inactivo temporal', 'Inactivo / dormido',
                'Perdido', 'Prospecto aprobado / por activar',
            ],
            $names('client-statuses'),
        );
        self::assertCount(8, $names('segments'));
        self::assertSame(['General', 'Pequeño contribuyente'], $names('tax-regimes'));
        self::assertSame([], $names('payment-methods'));
    }

    public function testTheSeededStatusesCarryTheirColor(): void
    {
        $list = $this->json($this->api('GET', '/client-statuses', $this->adminToken));
        $colors = array_column($this->rowsAt($list, 'data'), 'color', 'name');

        self::assertSame('#0B6BB0', $colors['Prospecto aprobado / por activar']);
        self::assertSame('#B3261E', $colors['Perdido']);
        self::assertSame('#7C8996', $colors['Inactivo / dormido']);
    }

    #[DataProvider('parameters')]
    public function testCreatesAValueAndAuditsIt(string $slug, string $table): void
    {
        $response = $this->api('POST', '/' . $slug, $this->adminToken, $this->body('  Nuevo valor  ', '#0b6bb0'));

        self::assertSame(201, $response->getStatusCode());
        $created = $this->json($response);
        self::assertSame('Nuevo valor', $created['name']);
        self::assertTrue($created['is_active']);
        self::assertSame(1, $created['version']);
        self::assertSame($slug === 'client-statuses' ? '#0B6BB0' : null, $created['color'] ?? null);
        self::assertSame($slug === 'client-statuses', array_key_exists('color', $created));

        $audit = $this->auditEntries($table, $this->text($created, 'id'));
        self::assertCount(1, $audit);
        self::assertSame('create', $audit[0]['action']);
    }

    #[DataProvider('parameters')]
    public function testTheNameIsRequiredAndUniqueAmongActiveValues(string $slug): void
    {
        $this->create($slug, 'Repetido');
        $this->create($slug, 'Retirado', active: false);

        $empty = $this->api('POST', '/' . $slug, $this->adminToken, $this->body(' '));
        self::assertSame(['name' => 'required'], $this->errorCodes($empty));
        $long = $this->api('POST', '/' . $slug, $this->adminToken, $this->body(str_repeat('a', 101)));
        self::assertSame(['name' => 'too_long'], $this->errorCodes($long));

        // The collation ignores case and accents, so these are the same name.
        $taken = $this->api('POST', '/' . $slug, $this->adminToken, $this->body('REPETIDO'));
        self::assertSame(['name' => 'taken'], $this->errorCodes($taken));

        // A deactivated value frees its name.
        $reused = $this->api('POST', '/' . $slug, $this->adminToken, $this->body('Retirado'));
        self::assertSame(201, $reused->getStatusCode());
    }

    public function testTheColorIsRequiredAndMustBeHex(): void
    {
        $missing = $this->api('POST', '/client-statuses', $this->adminToken, ['name' => 'Sin color']);
        self::assertSame(['color' => 'required'], $this->errorCodes($missing));

        foreach (['red', '#12345', '#GGGGGG', '0B6BB0', '#0B6BB0FF'] as $bad) {
            $response = $this->api('POST', '/client-statuses', $this->adminToken, $this->body('Mal color', $bad));
            self::assertSame(['color' => 'invalid'], $this->errorCodes($response), $bad);
        }
    }

    public function testOtherParametersIgnoreAColor(): void
    {
        $created = $this->json($this->api('POST', '/segments', $this->adminToken, $this->body('Con color', '#0B6BB0')));

        self::assertArrayNotHasKey('color', $created);
    }

    #[DataProvider('parameters')]
    public function testListsByNameHidesInactiveOnesAndSearches(string $slug): void
    {
        $this->create($slug, 'Zeta');
        $this->create($slug, 'Alfa');
        $this->create($slug, 'Beta oculta', active: false);
        $base = '/' . $slug . '?per_page=100';

        $active = $this->json($this->api('GET', $base, $this->adminToken));
        self::assertNotContains('Beta oculta', $this->columnAt($active, 'name', 'data'));
        $names = $this->columnAt($active, 'name', 'data');
        $sorted = $names;
        sort($sorted, SORT_NATURAL | SORT_FLAG_CASE);
        self::assertSame(['Alfa', 'Zeta'], array_values(array_intersect($names, ['Alfa', 'Zeta'])));
        self::assertSame($sorted, $names);

        $inactive = $this->json($this->api('GET', $base . '&status=inactive', $this->adminToken));
        self::assertSame(['Beta oculta'], $this->columnAt($inactive, 'name', 'data'));
        $found = $this->json($this->api('GET', $base . '&status=all&q=ocul', $this->adminToken));
        self::assertSame(['Beta oculta'], $this->columnAt($found, 'name', 'data'));
        self::assertSame(1, $this->valueAt($found, 'meta', 'total'));
    }

    #[DataProvider('parameters')]
    public function testEditsWithTheVersionItRead(string $slug, string $table, string $placeholder): void
    {
        $id = $this->create($slug, 'Original');

        $body = $this->body('Cambiado', '#00796B') + ['version' => 1];
        $edited = $this->api('PATCH', '/' . $slug . '/' . $id, $this->adminToken, $body);
        self::assertSame(200, $edited->getStatusCode(), $placeholder);
        self::assertSame('Cambiado', $this->json($edited)['name']);
        self::assertSame(2, $this->json($edited)['version']);

        $staleBody = $this->body('Otro') + ['version' => 1];
        $stale = $this->api('PATCH', '/' . $slug . '/' . $id, $this->adminToken, $staleBody);
        self::assertSame(409, $stale->getStatusCode());
        self::assertSame('conflict', $this->json($stale)['code']);

        $audit = $this->auditEntries($table, $id);
        self::assertSame(['create', 'update'], array_column($audit, 'action'));
        self::assertSame('Original', $this->valueAt($audit[1], 'before', 'name'));
        self::assertSame('Cambiado', $this->valueAt($audit[1], 'after', 'name'));
    }

    public function testChangingOnlyTheColorIsAuditedAndRepaintsTheStatus(): void
    {
        $id = $this->create('client-statuses', 'Con color', color: '#0B6BB0');

        $edited = $this->api('PATCH', '/client-statuses/' . $id, $this->adminToken, [
            'version' => 1,
            'name' => 'Con color',
            'color' => '#b0306a',
        ]);

        self::assertSame('#B0306A', $this->json($edited)['color']);
        $audit = $this->auditEntries('client_statuses', $id);
        self::assertSame(['name' => 'Con color', 'color' => '#0B6BB0'], $audit[1]['before']);
        self::assertSame(['name' => 'Con color', 'color' => '#B0306A'], $audit[1]['after']);
    }

    public function testAnEditThatChangesNothingIsNotAudited(): void
    {
        $id = $this->create('segments', 'Igual');
        $this->api('PATCH', '/segments/' . $id, $this->adminToken, ['version' => 1, 'name' => 'Igual']);

        self::assertSame(['create'], array_column($this->auditEntries('segments', $id), 'action'));
    }

    #[DataProvider('parameters')]
    public function testDeactivatesAndReactivatesIdempotently(string $slug, string $table): void
    {
        $id = $this->create($slug, 'Ciclo');

        $first = $this->api('POST', '/' . $slug . '/' . $id . '/deactivate', $this->adminToken);
        self::assertSame(200, $first->getStatusCode());
        self::assertFalse($this->json($first)['is_active']);
        $again = $this->api('POST', '/' . $slug . '/' . $id . '/deactivate', $this->adminToken);
        self::assertSame(200, $again->getStatusCode());
        self::assertSame($this->json($first)['version'], $this->json($again)['version']);

        $reactivated = $this->api('POST', '/' . $slug . '/' . $id . '/reactivate', $this->adminToken);
        self::assertTrue($this->json($reactivated)['is_active']);
        $reactivatedAgain = $this->api('POST', '/' . $slug . '/' . $id . '/reactivate', $this->adminToken);
        self::assertSame(200, $reactivatedAgain->getStatusCode());

        self::assertSame(
            ['create', 'deactivate', 'reactivate'],
            array_column($this->auditEntries($table, $id), 'action'),
        );
    }

    #[DataProvider('parameters')]
    public function testReactivatingFailsWhenAnActiveValueTookTheName(string $slug): void
    {
        $old = $this->create($slug, 'Compartido', active: false);
        $this->create($slug, 'Compartido');

        $response = $this->api('POST', '/' . $slug . '/' . $old . '/reactivate', $this->adminToken);

        self::assertSame(['name' => 'taken'], $this->errorCodes($response));
    }

    #[DataProvider('parameters')]
    public function testUnknownIdsAnswerNotFound(string $slug): void
    {
        $missing = '/' . $slug . '/0192a1b2-0000-7000-8000-000000000000';

        self::assertSame(404, $this->api('GET', $missing, $this->adminToken)->getStatusCode());
        self::assertSame(404, $this->api('POST', $missing . '/deactivate', $this->adminToken)->getStatusCode());
        self::assertSame(404, $this->api('POST', $missing . '/reactivate', $this->adminToken)->getStatusCode());
        self::assertSame(404, $this->api('GET', '/' . $slug . '/not-a-uuid', $this->adminToken)->getStatusCode());
    }

    public function testAnIdOfAnotherParameterIsNotFound(): void
    {
        $segment = $this->create('segments', 'De otro');

        self::assertSame(404, $this->api('GET', '/contact-types/' . $segment, $this->adminToken)->getStatusCode());
    }

    #[DataProvider('parameters')]
    public function testEachActionNeedsItsOwnResourcePermission(string $slug, string $table): void
    {
        $id = $this->create($slug, 'Protegido');
        $viewer = $this->tokenWith($table, 'view');
        $editor = $this->tokenWith($table, 'view', 'edit');

        self::assertSame(200, $this->api('GET', '/' . $slug, $viewer)->getStatusCode());
        self::assertSame(200, $this->api('GET', '/' . $slug . '/' . $id, $viewer)->getStatusCode());
        self::assertSame(403, $this->api('POST', '/' . $slug, $viewer, $this->body('x'))->getStatusCode());
        $patch = $this->api('PATCH', '/' . $slug . '/' . $id, $viewer, $this->body('x') + ['version' => 1]);
        self::assertSame(403, $patch->getStatusCode());
        self::assertSame(403, $this->api('POST', '/' . $slug . '/' . $id . '/deactivate', $editor)->getStatusCode());
        self::assertSame(403, $this->api('POST', '/' . $slug . '/' . $id . '/reactivate', $editor)->getStatusCode());
        self::assertSame(
            200,
            $this->api('PATCH', '/' . $slug . '/' . $id, $editor, $this->body('Editado') + ['version' => 1])
                ->getStatusCode(),
        );
    }

    public function testAPermissionOnOneParameterDoesNotOpenAnother(): void
    {
        $token = $this->tokenWith('segments', 'view', 'create', 'edit', 'deactivate');

        self::assertSame(200, $this->api('GET', '/segments', $token)->getStatusCode());
        self::assertSame(403, $this->api('GET', '/contact-types', $token)->getStatusCode());
        self::assertSame(403, $this->api('GET', '/client-statuses', $token)->getStatusCode());
    }

    public function testTheMigrationCanBeRepeatedWithoutDuplicatingTheSeed(): void
    {
        $this->applyMigrationAgain('20261013000002');

        self::assertSame(8, $this->countRows('SELECT COUNT(*) FROM segments'));
        self::assertSame(6, $this->countRows('SELECT COUNT(*) FROM client_statuses'));
        self::assertSame(45, $this->countRows('SELECT COUNT(*) FROM role_permissions'));
    }

    /** @return array<string, string> */
    private function body(string $name, ?string $color = '#0B6BB0'): array
    {
        return ['name' => $name, 'color' => (string) $color];
    }

    private function create(string $slug, string $name, bool $active = true, string $color = '#0B6BB0'): string
    {
        $response = $this->api('POST', '/' . $slug, $this->adminToken, $this->body($name, $color));
        self::assertSame(201, $response->getStatusCode());
        $id = $this->text($this->json($response), 'id');
        if (!$active) {
            $this->api('POST', '/' . $slug . '/' . $id . '/deactivate', $this->adminToken);
        }

        return $id;
    }
}
