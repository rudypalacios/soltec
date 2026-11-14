<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Workflow;

use Soltec\Tests\Integration\Access\AccessTestCase;

/** The columns of the board of a flow (ADR-0030): what the migration gives, how they are arranged and what they refuse. */
final class BoardColumnsTest extends AccessTestCase
{
    private const SEED = '20261030000002';
    private const COLUMNS = '20261114000001';

    private string $adminToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resetFlows();
        $this->adminToken = $this->tokenFor($this->createAdmin()['id']);
    }

    protected function tearDown(): void
    {
        $this->resetFlows();
        parent::tearDown();
    }

    public function testEveryStateStartsInAColumnOfItsOwnNamedLikeIt(): void
    {
        $columns = $this->columns('task');

        self::assertSame(
            ['Asignada', 'Aceptada', 'En ejecución', 'Completada', 'Cerrada', 'Rechazada'],
            array_column($columns, 'name'),
        );
        self::assertSame([1, 2, 3, 4, 5, 6], array_column($columns, 'sort_order'));
        self::assertSame([false, false, false, false, true, false], array_column($columns, 'is_final'));
        self::assertSame(['#0B6BB0', '#00796B'], array_slice(array_column($columns, 'color'), 0, 2));
        foreach ($this->states('task') as $state) {
            $column = $this->columnOf($columns, $this->text($state, 'board_column_id'));
            self::assertSame([$state['id']], $column['state_ids']);
            self::assertSame($state['name'], $column['name']);
        }
        self::assertCount(4, $this->columns('ticket'));
    }

    public function testTheMigrationCanBeRepeatedWithoutDuplicatingColumns(): void
    {
        $this->applyMigrationAgain(self::COLUMNS);

        self::assertSame(10, $this->countRows('SELECT COUNT(*) FROM board_columns'));
        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM workflow_states WHERE board_column_id IS NULL'));
    }

    public function testAnUnknownFlowIsNotFound(): void
    {
        self::assertSame(404, $this->api('GET', '/workflows/quote/board-columns', $this->adminToken)->getStatusCode());
        self::assertSame(404, $this->api('PUT', '/workflows/quote/board-columns', $this->adminToken, [
            'columns' => [['name' => 'A', 'state_ids' => [$this->stateId('task', 'Asignada')]]],
        ])->getStatusCode());
    }

    public function testANewStateStartsItsOwnColumnAtTheEndOrJoinsAnExistingOne(): void
    {
        $own = $this->json($this->api('POST', '/workflows/task/states', $this->adminToken, [
            'name' => 'En revisión',
            'color' => '#7B1FA2',
        ]));
        $columns = $this->columns('task');
        $last = $columns[count($columns) - 1];
        self::assertSame('En revisión', $last['name']);
        self::assertSame([$own['id']], $last['state_ids']);
        self::assertSame($last['id'], $own['board_column_id']);

        $joins = $this->json($this->api('POST', '/workflows/task/states', $this->adminToken, [
            'name' => 'Pausada',
            'color' => '#5B6875',
            'board_column_id' => $this->columnIdNamed('task', 'Aceptada'),
        ]));
        self::assertSame($this->columnIdNamed('task', 'Aceptada'), $joins['board_column_id']);
        self::assertCount(7, $this->columns('task'));
        $accepted = $this->valueAt($this->columnNamed('task', 'Aceptada'), 'state_ids');
        self::assertIsArray($accepted);
        self::assertCount(2, $accepted);
    }

    public function testANewStateCannotJoinAColumnOfAnotherFlowOrAnUnknownOne(): void
    {
        foreach ([$this->columnIdNamed('ticket', 'Abierto'), '0192a1b2-0000-7000-8000-000000000000'] as $id) {
            $response = $this->api('POST', '/workflows/task/states', $this->adminToken, [
                'name' => 'Pausada',
                'color' => '#5B6875',
                'board_column_id' => $id,
            ]);
            self::assertSame(422, $response->getStatusCode());
            self::assertSame(['board_column_id' => 'not_found'], $this->errorCodes($response));
        }
        self::assertCount(6, $this->states('task'));
        self::assertCount(6, $this->columns('task'));
    }

    public function testMergesRenamesReordersAndCreatesColumnsInOneStepAndAuditsIt(): void
    {
        $assigned = $this->stateId('task', 'Asignada');
        $accepted = $this->stateId('task', 'Aceptada');
        $running = $this->stateId('task', 'En ejecución');
        $done = $this->stateId('task', 'Completada');
        $closed = $this->stateId('task', 'Cerrada');
        $rejected = $this->stateId('task', 'Rechazada');
        $closedColumn = $this->columnIdNamed('task', 'Cerrada');
        $assignedColumn = $this->columnIdNamed('task', 'Asignada');
        $acceptedColumn = $this->columnIdNamed('task', 'Aceptada');

        $response = $this->replace('task', [
            ['id' => $assignedColumn, 'name' => 'Por hacer', 'state_ids' => [$assigned, $rejected]],
            ['id' => $acceptedColumn, 'name' => 'En curso', 'state_ids' => [$accepted, $running]],
            ['name' => 'Listas', 'state_ids' => [$done]],
            ['id' => $closedColumn, 'name' => 'Cerrada', 'state_ids' => [$closed]],
        ]);

        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $columns = $this->rowsAt($this->json($response), 'data');
        self::assertSame(['Por hacer', 'En curso', 'Listas', 'Cerrada'], array_column($columns, 'name'));
        self::assertSame([1, 2, 3, 4], array_column($columns, 'sort_order'));
        self::assertSame([$assigned, $rejected], $columns[0]['state_ids']);
        self::assertSame([$accepted, $running], $columns[1]['state_ids']);
        self::assertSame([false, false, false, true], array_column($columns, 'is_final'));
        self::assertSame($assignedColumn, $columns[0]['id']);
        self::assertNotContains($columns[2]['id'], [$assignedColumn, $acceptedColumn, $closedColumn]);
        self::assertSame($columns, $this->columns('task'));
        $rejectedState = $this->stateNamed('task', 'Rechazada');
        self::assertSame($assignedColumn, $rejectedState['board_column_id']);

        $audit = $this->auditEntries('board_columns');
        self::assertSame(['update'], array_column($audit, 'action'));
        $change = $audit[0];
        self::assertSame(
            [
                'Por hacer: Asignada, Rechazada',
                'En curso: Aceptada, En ejecución',
                'Listas: Completada',
                'Cerrada: Cerrada',
            ],
            $this->valueAt($change, 'after', 'columns'),
        );
        $before = $this->valueAt($change, 'before', 'columns');
        self::assertIsArray($before);
        self::assertSame('Asignada: Asignada', $before[0]);
        // The columns left out had no state left: they are closed, and the other flow is untouched.
        self::assertSame(3, $this->countRows(
            "SELECT COUNT(*) FROM board_columns WHERE workflow_code = 'task' AND deleted_at IS NOT NULL",
        ));
        self::assertCount(4, $this->columns('ticket'));
    }

    public function testSavingTheSameArrangementChangesNothing(): void
    {
        $columns = array_map(
            static fn (array $column): array => [
                'id' => $column['id'],
                'name' => $column['name'],
                'state_ids' => $column['state_ids'],
            ],
            $this->columns('task'),
        );
        $version = $this->countRows('SELECT SUM(version) FROM board_columns');

        $response = $this->replace('task', $columns);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame($version, $this->countRows('SELECT SUM(version) FROM board_columns'));
        self::assertSame([], $this->auditEntries('board_columns'));
    }

    public function testRefusesAnArrangementThatDoesNotPlaceEveryActiveStateExactlyOnce(): void
    {
        $states = array_column($this->states('task'), 'id');
        $arrangement = static fn (array $ids): array => [['name' => 'Todo', 'state_ids' => $ids]];

        $missing = $this->replace('task', $arrangement(array_slice($states, 1)));
        self::assertSame(422, $missing->getStatusCode());
        self::assertSame(['state_ids' => 'invalid'], $this->errorCodes($missing));

        $twice = $this->replace('task', [
            ['name' => 'A', 'state_ids' => $states],
            ['name' => 'B', 'state_ids' => [$states[0]]],
        ]);
        self::assertSame(['state_ids' => 'invalid'], $this->errorCodes($twice));

        $foreign = $this->replace('task', $arrangement([...$states, $this->stateId('ticket', 'Abierto')]));
        self::assertSame(['state_ids' => 'invalid'], $this->errorCodes($foreign));

        self::assertCount(6, $this->columns('task'));
    }

    public function testRefusesBadColumns(): void
    {
        $states = array_column($this->states('task'), 'id');
        $first = $this->columns('task')[0];

        $sameName = $this->replace('task', [
            ['name' => 'Hechas', 'state_ids' => array_slice($states, 0, 3)],
            ['name' => ' hechas ', 'state_ids' => array_slice($states, 3)],
        ]);
        self::assertSame(['columns' => 'invalid'], $this->errorCodes($sameName));

        $unknown = $this->replace('task', [
            ['id' => '0192a1b2-0000-7000-8000-000000000000', 'name' => 'Todo', 'state_ids' => $states],
        ]);
        self::assertSame(['columns' => 'invalid'], $this->errorCodes($unknown));

        $otherFlow = $this->replace('task', [
            ['id' => $this->columnIdNamed('ticket', 'Abierto'), 'name' => 'Todo', 'state_ids' => $states],
        ]);
        self::assertSame(['columns' => 'invalid'], $this->errorCodes($otherFlow));

        $repeatedId = $this->replace('task', [
            ['id' => $first['id'], 'name' => 'A', 'state_ids' => array_slice($states, 0, 3)],
            ['id' => $first['id'], 'name' => 'B', 'state_ids' => array_slice($states, 3)],
        ]);
        self::assertSame(['columns' => 'invalid'], $this->errorCodes($repeatedId));

        $noStates = $this->replace('task', [
            ['name' => 'Vacía', 'state_ids' => []],
            ['name' => 'T', 'state_ids' => $states],
        ]);
        self::assertSame(['columns.0.state_ids' => 'required'], $this->errorCodes($noStates));

        $noName = $this->replace('task', [['name' => '', 'state_ids' => $states]]);
        self::assertSame(['columns.0.name' => 'required'], $this->errorCodes($noName));

        self::assertSame(['columns' => 'required'], $this->errorCodes($this->replace('task', [])));
        self::assertCount(6, $this->columns('task'));
    }

    public function testAColumnLeftOutThatStillHoldsAnInactiveStateStaysAtTheEnd(): void
    {
        $rejected = $this->stateId('task', 'Rechazada');
        $rejectedColumn = $this->columnIdNamed('task', 'Rechazada');
        $this->deactivate('task', $rejected);
        $active = array_column($this->states('task', 'active'), 'id');

        $response = $this->replace('task', [['name' => 'Todas', 'state_ids' => $active]]);

        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $columns = $this->rowsAt($this->json($response), 'data');
        self::assertSame(['Todas', 'Rechazada'], array_column($columns, 'name'));
        self::assertSame($rejectedColumn, $columns[1]['id']);
        self::assertSame([], $columns[1]['state_ids']);

        // Reactivating the state finds its column where it was.
        $this->api('POST', '/workflows/task/states/' . $rejected . '/reactivate', $this->adminToken);
        self::assertSame([$rejected], $this->columnNamed('task', 'Rechazada')['state_ids']);
    }

    public function testDeactivatingAStateLeavesItsColumnAlone(): void
    {
        $accepted = $this->stateId('task', 'Aceptada');
        $this->deactivate('task', $accepted);

        $column = $this->columnNamed('task', 'Aceptada');
        self::assertSame([], $column['state_ids']);
        self::assertSame($column['id'], $this->stateNamed('task', 'Aceptada')['board_column_id']);
    }

    public function testEachActionNeedsItsOwnPermission(): void
    {
        $viewer = $this->tokenWith('workflow_states', 'view');
        $states = array_column($this->states('task'), 'id');
        $body = ['columns' => [['name' => 'Todo', 'state_ids' => $states]]];

        self::assertSame(200, $this->api('GET', '/workflows/task/board-columns', $viewer)->getStatusCode());
        self::assertSame(403, $this->api('PUT', '/workflows/task/board-columns', $viewer, $body)->getStatusCode());
        $nobody = $this->tokenWith('departments', 'view');
        self::assertSame(403, $this->api('GET', '/workflows/task/board-columns', $nobody)->getStatusCode());
        self::assertSame(401, $this->api('GET', '/workflows/task/board-columns')->getStatusCode());
    }

    /**
     * @param list<array<string, mixed>> $columns
     * @return \Psr\Http\Message\ResponseInterface
     */
    private function replace(string $flow, array $columns)
    {
        return $this->api('PUT', '/workflows/' . $flow . '/board-columns', $this->adminToken, ['columns' => $columns]);
    }

    /** @return list<array<string, mixed>> */
    private function columns(string $flow): array
    {
        $response = $this->api('GET', '/workflows/' . $flow . '/board-columns', $this->adminToken);
        self::assertSame(200, $response->getStatusCode());

        return $this->rowsAt($this->json($response), 'data');
    }

    /** @return list<array<string, mixed>> */
    private function states(string $flow, string $status = 'all'): array
    {
        $response = $this->api('GET', '/workflows/' . $flow . '/states?status=' . $status, $this->adminToken);
        self::assertSame(200, $response->getStatusCode());

        return $this->rowsAt($this->json($response), 'data');
    }

    /** @return array<string, mixed> */
    private function stateNamed(string $flow, string $name): array
    {
        foreach ($this->states($flow) as $state) {
            if ($state['name'] === $name) {
                return $state;
            }
        }

        self::fail(sprintf('The %s flow has no state called %s.', $flow, $name));
    }

    private function stateId(string $flow, string $name): string
    {
        return $this->text($this->stateNamed($flow, $name), 'id');
    }

    /** @return array<string, mixed> */
    private function columnNamed(string $flow, string $name): array
    {
        foreach ($this->columns($flow) as $column) {
            if ($column['name'] === $name) {
                return $column;
            }
        }

        self::fail(sprintf('The %s board has no column called %s.', $flow, $name));
    }

    private function columnIdNamed(string $flow, string $name): string
    {
        return $this->text($this->columnNamed($flow, $name), 'id');
    }

    /**
     * @param list<array<string, mixed>> $columns
     * @return array<string, mixed>
     */
    private function columnOf(array $columns, string $id): array
    {
        foreach ($columns as $column) {
            if ($column['id'] === $id) {
                return $column;
            }
        }

        self::fail('No column ' . $id);
    }

    private function deactivate(string $flow, string $id): void
    {
        $response = $this->api('POST', '/workflows/' . $flow . '/states/' . $id . '/deactivate', $this->adminToken);
        self::assertSame(200, $response->getStatusCode());
    }

    /** Puts both flows back to what the migrations seed, so no test depends on what another one left. */
    private function resetFlows(): void
    {
        $this->connection->executeStatement('DELETE FROM workflow_transitions');
        $this->connection->executeStatement('DELETE FROM workflow_states');
        $this->connection->executeStatement('DELETE FROM board_columns');
        $this->connection->executeStatement('ALTER TABLE workflow_states MODIFY board_column_id BINARY(16) NULL');
        $this->applyMigrationAgain(self::SEED);
        $this->applyMigrationAgain(self::COLUMNS);
    }
}
