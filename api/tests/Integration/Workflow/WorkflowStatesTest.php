<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Workflow;

use Soltec\Modules\Workflow\Application\WorkflowEngine;
use Soltec\Modules\Workflow\Domain\WorkflowCode;
use Soltec\Tests\Integration\Access\AccessTestCase;

final class WorkflowStatesTest extends AccessTestCase
{
    private const MIGRATION = '20261030000002';

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

    public function testTheMigrationSeedsTheTaskAndTicketFlows(): void
    {
        $tasks = $this->states('task');
        self::assertSame(
            ['Asignada', 'Aceptada', 'En ejecución', 'Completada', 'Cerrada', 'Rechazada'],
            array_column($tasks, 'name'),
        );
        self::assertSame(['Asignada'], $this->namesWhere($tasks, 'is_initial'));
        self::assertSame(['Cerrada'], $this->namesWhere($tasks, 'is_terminal'));
        self::assertSame(['Aceptada', 'Rechazada'], $this->destinationsOf($tasks, 'Asignada'));
        self::assertSame(['Cerrada', 'En ejecución'], $this->destinationsOf($tasks, 'Completada'));
        self::assertSame(['Asignada'], $this->destinationsOf($tasks, 'Rechazada'));

        $tickets = $this->states('ticket');
        self::assertSame(['Abierto', 'En atención', 'Resuelto', 'Cerrado'], array_column($tickets, 'name'));
        self::assertSame(['Abierto'], $this->namesWhere($tickets, 'is_initial'));
        self::assertSame(['Cerrado'], $this->namesWhere($tickets, 'is_terminal'));
        self::assertSame(['Cerrado', 'En atención'], $this->destinationsOf($tickets, 'Resuelto'));
    }

    public function testTheMigrationCanBeRepeatedWithoutDuplicatingTheSeed(): void
    {
        $this->applyMigrationAgain(self::MIGRATION);

        self::assertSame(10, $this->countRows('SELECT COUNT(*) FROM workflow_states'));
        self::assertSame(11, $this->countRows('SELECT COUNT(*) FROM workflow_transitions'));
    }

    public function testAnUnknownFlowIsNotFound(): void
    {
        self::assertSame(404, $this->api('GET', '/workflows/quote/states', $this->adminToken)->getStatusCode());
        self::assertSame(404, $this->api('POST', '/workflows/quote/states', $this->adminToken, [
            'name' => 'Nueva',
            'color' => '#0B6BB0',
        ])->getStatusCode());
    }

    public function testListsByStatusAndKeepsTheFlowsApart(): void
    {
        $this->deactivate('task', $this->idOf('task', 'Rechazada'));

        self::assertCount(5, $this->states('task', 'active'));
        self::assertSame(['Rechazada'], array_column($this->states('task', 'inactive'), 'name'));
        self::assertCount(6, $this->states('task'));
        self::assertCount(4, $this->states('ticket'));
    }

    public function testCreatesAStateAtTheEndWithoutTransitionsAndAuditsIt(): void
    {
        $response = $this->api('POST', '/workflows/task/states', $this->adminToken, [
            'name' => '  En revisión  ',
            'color' => '#6b4fa3',
        ]);

        self::assertSame(201, $response->getStatusCode());
        $state = $this->json($response);
        self::assertSame('En revisión', $state['name']);
        self::assertSame('#6B4FA3', $state['color']);
        self::assertSame('task', $state['workflow']);
        self::assertFalse($state['is_initial']);
        self::assertFalse($state['is_terminal']);
        self::assertSame([], $state['transitions_to']);
        self::assertSame('En revisión', array_column($this->states('task'), 'name')[6]);

        $audit = $this->auditEntries('workflow_states', $this->text($state, 'id'));
        self::assertCount(1, $audit);
        self::assertSame('create', $audit[0]['action']);
    }

    public function testValidatesTheNewState(): void
    {
        $empty = $this->api('POST', '/workflows/task/states', $this->adminToken, ['name' => ' ', 'color' => 'azul']);
        self::assertSame(['name' => 'required', 'color' => 'invalid'], $this->errorCodes($empty));

        $taken = $this->api('POST', '/workflows/task/states', $this->adminToken, [
            'name' => 'Aceptada',
            'color' => '#0B6BB0',
        ]);
        self::assertSame(['name' => 'taken'], $this->errorCodes($taken));

        // The same name in the other flow is fine, and so is the name of a deactivated state.
        $this->deactivate('task', $this->idOf('task', 'Rechazada'));
        foreach ([['ticket', 'Aceptada'], ['task', 'Rechazada']] as [$flow, $name]) {
            $created = $this->api('POST', '/workflows/' . $flow . '/states', $this->adminToken, [
                'name' => $name,
                'color' => '#0B6BB0',
            ]);
            self::assertSame(201, $created->getStatusCode());
        }
    }

    public function testEditsAStateWithTheVersionItRead(): void
    {
        $id = $this->idOf('task', 'Aceptada');

        $response = $this->api('PATCH', '/workflows/task/states/' . $id, $this->adminToken, [
            'version' => 1,
            'name' => 'Aceptada por el técnico',
            'color' => '#1e7a4c',
            'is_terminal' => true,
        ]);

        self::assertSame(200, $response->getStatusCode());
        $state = $this->json($response);
        self::assertSame('Aceptada por el técnico', $state['name']);
        self::assertSame('#1E7A4C', $state['color']);
        self::assertTrue($state['is_terminal']);
        self::assertSame(2, $state['version']);

        $audit = $this->auditEntries('workflow_states', $id);
        self::assertSame('update', $audit[0]['action']);
        self::assertSame(
            ['name' => 'Aceptada por el técnico', 'color' => '#1E7A4C', 'is_terminal' => true],
            $audit[0]['after'],
        );

        $stale = $this->api('PATCH', '/workflows/task/states/' . $id, $this->adminToken, [
            'version' => 1,
            'name' => 'Otra',
            'color' => '#1E7A4C',
        ]);
        self::assertSame(409, $stale->getStatusCode());
    }

    public function testMovesTheInitialFlagToAnotherState(): void
    {
        $accepted = $this->idOf('task', 'Aceptada');

        $response = $this->api('PATCH', '/workflows/task/states/' . $accepted, $this->adminToken, [
            'version' => 1,
            'name' => 'Aceptada',
            'color' => '#00796B',
            'is_initial' => true,
        ]);

        self::assertSame(200, $response->getStatusCode());
        self::assertTrue($this->json($response)['is_initial']);
        self::assertSame(['Aceptada'], $this->namesWhere($this->states('task'), 'is_initial'));
        self::assertSame(['Abierto'], $this->namesWhere($this->states('ticket'), 'is_initial'));
    }

    public function testTheInitialStateKeepsItsFlagWhenEditedWithoutAskingForIt(): void
    {
        $initial = $this->idOf('task', 'Asignada');

        $this->api('PATCH', '/workflows/task/states/' . $initial, $this->adminToken, [
            'version' => 1,
            'name' => 'Pendiente',
            'color' => '#0B6BB0',
        ]);

        self::assertSame(['Pendiente'], $this->namesWhere($this->states('task'), 'is_initial'));
    }

    public function testRefusesFlagsThatLeaveTheFlowWithoutWhatItNeeds(): void
    {
        $initial = $this->idOf('task', 'Asignada');
        $closed = $this->idOf('task', 'Cerrada');

        $terminalInitial = $this->api('PATCH', '/workflows/task/states/' . $initial, $this->adminToken, [
            'version' => 1,
            'name' => 'Asignada',
            'color' => '#0B6BB0',
            'is_terminal' => true,
        ]);
        self::assertSame(['is_terminal' => 'initial_cannot_be_terminal'], $this->errorCodes($terminalInitial));

        $lastTerminal = $this->api('PATCH', '/workflows/task/states/' . $closed, $this->adminToken, [
            'version' => 1,
            'name' => 'Cerrada',
            'color' => '#7C8996',
            'is_terminal' => false,
        ]);
        self::assertSame(409, $lastTerminal->getStatusCode());
        self::assertSame('last_terminal_state', $this->json($lastTerminal)['code']);

        $rejected = $this->idOf('task', 'Rechazada');
        $this->deactivate('task', $rejected);
        $inactiveInitial = $this->api('PATCH', '/workflows/task/states/' . $rejected, $this->adminToken, [
            'version' => 2,
            'name' => 'Rechazada',
            'color' => '#B3261E',
            'is_initial' => true,
        ]);
        self::assertSame(['is_initial' => 'inactive_state'], $this->errorCodes($inactiveInitial));
    }

    public function testDeactivatingAStateRemovesItAsADestinationAndReactivatingBringsItBack(): void
    {
        $accepted = $this->idOf('task', 'Aceptada');

        $deactivated = $this->deactivate('task', $accepted);
        self::assertFalse($deactivated['is_active']);
        self::assertSame(['Rechazada'], $this->destinationsOf($this->states('task'), 'Asignada'));
        self::assertSame(['deactivate'], array_column($this->auditEntries('workflow_states', $accepted), 'action'));

        // Idempotent: the second call changes and audits nothing.
        $this->deactivate('task', $accepted);
        self::assertCount(1, $this->auditEntries('workflow_states', $accepted));

        $reactivated = $this->api('POST', '/workflows/task/states/' . $accepted . '/reactivate', $this->adminToken);
        self::assertSame(200, $reactivated->getStatusCode());
        self::assertTrue($this->json($reactivated)['is_active']);
        self::assertSame(['Aceptada', 'Rechazada'], $this->destinationsOf($this->states('task'), 'Asignada'));
        self::assertSame(['En ejecución'], $this->destinationsOf($this->states('task'), 'Aceptada'));
    }

    public function testTheInitialAndTheLastTerminalStateCannotBeDeactivated(): void
    {
        $initial = $this->api(
            'POST',
            '/workflows/task/states/' . $this->idOf('task', 'Asignada') . '/deactivate',
            $this->adminToken,
        );
        self::assertSame(409, $initial->getStatusCode());
        self::assertSame('state_is_initial', $this->json($initial)['code']);

        $closed = $this->api(
            'POST',
            '/workflows/task/states/' . $this->idOf('task', 'Cerrada') . '/deactivate',
            $this->adminToken,
        );
        self::assertSame(409, $closed->getStatusCode());
        self::assertSame('last_terminal_state', $this->json($closed)['code']);

        // With another terminal state active the first one can go.
        $second = $this->json($this->api('POST', '/workflows/task/states', $this->adminToken, [
            'name' => 'Archivada',
            'color' => '#7C8996',
            'is_terminal' => true,
        ]));
        self::assertSame(
            200,
            $this->api(
                'POST',
                '/workflows/task/states/' . $this->idOf('task', 'Cerrada') . '/deactivate',
                $this->adminToken,
            )->getStatusCode(),
        );
        self::assertSame(['Archivada'], $this->namesWhere($this->states('task', 'active'), 'is_terminal'));
        self::assertSame('Archivada', $second['name']);
    }

    public function testReactivatingIsRefusedWhenTheNameWasTakenMeanwhile(): void
    {
        $rejected = $this->idOf('task', 'Rechazada');
        $this->deactivate('task', $rejected);
        $this->api('POST', '/workflows/task/states', $this->adminToken, ['name' => 'Rechazada', 'color' => '#B3261E']);

        $response = $this->api('POST', '/workflows/task/states/' . $rejected . '/reactivate', $this->adminToken);

        self::assertSame(['name' => 'taken'], $this->errorCodes($response));
    }

    public function testAStateOfAnotherFlowIsNotFoundThroughThisOne(): void
    {
        $ticketState = $this->idOf('ticket', 'Abierto');

        self::assertSame(
            404,
            $this->api('GET', '/workflows/task/states/' . $ticketState, $this->adminToken)->getStatusCode(),
        );
        self::assertSame(
            404,
            $this->api('POST', '/workflows/task/states/' . $ticketState . '/deactivate', $this->adminToken)
                ->getStatusCode(),
        );
    }

    public function testReordersTheActiveStatesAndAuditsIt(): void
    {
        $ids = array_column($this->states('ticket', 'active'), 'id');
        $reversed = array_reverse($ids);

        $response = $this->api('PUT', '/workflows/ticket/states/order', $this->adminToken, ['ids' => $reversed]);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(
            ['Cerrado', 'Resuelto', 'En atención', 'Abierto'],
            $this->columnAt($this->json($response), 'name', 'data'),
        );
        self::assertSame(
            ['Cerrado', 'Resuelto', 'En atención', 'Abierto'],
            array_column($this->states('ticket'), 'name'),
        );

        $audit = $this->auditEntries('workflow_states');
        self::assertSame('update', $audit[0]['action']);
        self::assertSame('ticket', $audit[0]['before']['workflow'] ?? null);
        self::assertSame(['Abierto', 'En atención', 'Resuelto', 'Cerrado'], $audit[0]['before']['order'] ?? null);
    }

    public function testTheOrderMustNameEveryActiveStateOnce(): void
    {
        $ids = array_column($this->states('ticket', 'active'), 'id');

        foreach ([array_slice($ids, 1), [...$ids, $this->idOf('task', 'Asignada')], [$ids[0], ...$ids]] as $wrong) {
            $response = $this->api('PUT', '/workflows/ticket/states/order', $this->adminToken, ['ids' => $wrong]);
            self::assertSame(422, $response->getStatusCode());
        }
        self::assertSame(
            ['Abierto', 'En atención', 'Resuelto', 'Cerrado'],
            array_column($this->states('ticket'), 'name'),
        );
    }

    public function testReplacesTheTransitionsAndAuditsTheChange(): void
    {
        $open = $this->idOf('ticket', 'Abierto');
        $attending = $this->idOf('ticket', 'En atención');
        $solved = $this->idOf('ticket', 'Resuelto');
        $closed = $this->idOf('ticket', 'Cerrado');

        $response = $this->api('PUT', '/workflows/ticket/transitions', $this->adminToken, ['transitions' => [
            ['from_id' => $open, 'to_id' => $solved],
            ['from_id' => $open, 'to_id' => $attending],
            ['from_id' => $solved, 'to_id' => $closed],
        ]]);

        self::assertSame(200, $response->getStatusCode());
        $states = $this->states('ticket');
        self::assertSame(['En atención', 'Resuelto'], $this->destinationsOf($states, 'Abierto'));
        self::assertSame([], $this->destinationsOf($states, 'En atención'));
        self::assertSame(['Cerrado'], $this->destinationsOf($states, 'Resuelto'));
        // The other flow keeps its own.
        self::assertSame(['Aceptada', 'Rechazada'], $this->destinationsOf($this->states('task'), 'Asignada'));

        $audit = $this->auditEntries('workflow_states');
        self::assertSame('update', $audit[0]['action']);
        self::assertContains('Abierto → Resuelto', $this->listAt($audit[0]['after'] ?? [], 'transitions'));

        // Sending the same set again changes and audits nothing.
        $this->api('PUT', '/workflows/ticket/transitions', $this->adminToken, ['transitions' => [
            ['from_id' => $open, 'to_id' => $solved],
            ['from_id' => $open, 'to_id' => $attending],
            ['from_id' => $solved, 'to_id' => $closed],
        ]]);
        self::assertCount(1, $this->auditEntries('workflow_states'));
    }

    public function testRefusesTransitionsThatMakeNoSense(): void
    {
        $open = $this->idOf('ticket', 'Abierto');
        $solved = $this->idOf('ticket', 'Resuelto');
        $taskState = $this->idOf('task', 'Asignada');
        $unknown = '0192b7a0-0000-7000-8000-000000000000';

        $cases = [
            'itself' => [['from_id' => $open, 'to_id' => $open]],
            'repeated' => [['from_id' => $open, 'to_id' => $solved], ['from_id' => $open, 'to_id' => $solved]],
            'another flow' => [['from_id' => $open, 'to_id' => $taskState]],
            'unknown' => [['from_id' => $open, 'to_id' => $unknown]],
        ];
        foreach ($cases as $name => $transitions) {
            $response = $this->api('PUT', '/workflows/ticket/transitions', $this->adminToken, [
                'transitions' => $transitions,
            ]);
            self::assertSame(422, $response->getStatusCode(), $name);
        }
        self::assertSame(['En atención'], $this->destinationsOf($this->states('ticket'), 'Abierto'));
    }

    public function testTransitionsThatTouchAnInactiveStateSurviveAReplacement(): void
    {
        $accepted = $this->idOf('task', 'Aceptada');
        $this->deactivate('task', $accepted);

        $assigned = $this->idOf('task', 'Asignada');
        $running = $this->idOf('task', 'En ejecución');
        $this->api('PUT', '/workflows/task/transitions', $this->adminToken, ['transitions' => [
            ['from_id' => $assigned, 'to_id' => $running],
        ]]);
        $this->api('POST', '/workflows/task/states/' . $accepted . '/reactivate', $this->adminToken);

        $states = $this->states('task');
        self::assertSame(['Aceptada', 'En ejecución'], $this->destinationsOf($states, 'Asignada'));
        self::assertSame(['En ejecución'], $this->destinationsOf($states, 'Aceptada'));
    }

    public function testTheEngineAnswersWhereARecordStartsAndWhereItMayGo(): void
    {
        $engine = $this->service(WorkflowEngine::class);
        $assigned = $this->idOf('task', 'Asignada');
        $accepted = $this->idOf('task', 'Aceptada');
        $closed = $this->idOf('task', 'Cerrada');

        self::assertSame($assigned, $engine->initialStateId(WorkflowCode::Task));
        self::assertSame($this->idOf('ticket', 'Abierto'), $engine->initialStateId(WorkflowCode::Ticket));
        self::assertTrue($engine->canTransition(WorkflowCode::Task, $assigned, $accepted));
        self::assertFalse($engine->canTransition(WorkflowCode::Task, $assigned, $closed));
        self::assertFalse($engine->canTransition(WorkflowCode::Task, $accepted, $assigned));

        $this->deactivate('task', $accepted);
        self::assertFalse($engine->canTransition(WorkflowCode::Task, $assigned, $accepted));
        // A state of another flow is never a valid destination.
        self::assertFalse($engine->canTransition(WorkflowCode::Ticket, $assigned, $accepted));
    }

    public function testEachActionNeedsItsOwnPermission(): void
    {
        $viewer = $this->tokenWith('workflow_states', 'view');
        $id = $this->idOf('task', 'Aceptada');
        $body = ['name' => 'Nueva', 'color' => '#0B6BB0'];

        self::assertSame(200, $this->api('GET', '/workflows/task/states', $viewer)->getStatusCode());
        self::assertSame(200, $this->api('GET', '/workflows/task/states/' . $id, $viewer)->getStatusCode());
        self::assertSame(403, $this->api('POST', '/workflows/task/states', $viewer, $body)->getStatusCode());
        self::assertSame(403, $this->api('PATCH', '/workflows/task/states/' . $id, $viewer, [
            'version' => 1,
            ...$body,
        ])->getStatusCode());
        self::assertSame(
            403,
            $this->api('POST', '/workflows/task/states/' . $id . '/deactivate', $viewer)->getStatusCode(),
        );
        self::assertSame(403, $this->api('PUT', '/workflows/task/transitions', $viewer, ['transitions' => []])
            ->getStatusCode());
        self::assertSame(403, $this->api('PUT', '/workflows/task/states/order', $viewer, ['ids' => [$id]])
            ->getStatusCode());

        $nobody = $this->tokenWith('departments', 'view');
        self::assertSame(403, $this->api('GET', '/workflows/task/states', $nobody)->getStatusCode());
    }

    /** @return list<array<string, mixed>> */
    private function states(string $flow, string $status = 'all'): array
    {
        $response = $this->api('GET', '/workflows/' . $flow . '/states?status=' . $status, $this->adminToken);
        self::assertSame(200, $response->getStatusCode());

        return $this->rowsAt($this->json($response), 'data');
    }

    private function idOf(string $flow, string $name): string
    {
        foreach ($this->states($flow) as $state) {
            if ($state['name'] === $name) {
                return $this->text($state, 'id');
            }
        }

        self::fail(sprintf('The %s flow has no state called %s.', $flow, $name));
    }

    /** @return array<string, mixed> */
    private function deactivate(string $flow, string $id): array
    {
        $response = $this->api('POST', '/workflows/' . $flow . '/states/' . $id . '/deactivate', $this->adminToken);
        self::assertSame(200, $response->getStatusCode());

        return $this->json($response);
    }

    /**
     * @param list<array<string, mixed>> $states
     * @return list<string>
     */
    private function namesWhere(array $states, string $flag): array
    {
        $names = [];
        foreach ($states as $state) {
            if ($state[$flag] === true) {
                $names[] = $this->text($state, 'name');
            }
        }

        return $names;
    }

    /**
     * @param list<array<string, mixed>> $states
     * @return list<string> the names of the states the named one may move to, sorted
     */
    private function destinationsOf(array $states, string $name): array
    {
        $names = [];
        foreach ($states as $state) {
            $names[$this->text($state, 'id')] = $this->text($state, 'name');
        }
        foreach ($states as $state) {
            if ($state['name'] === $name) {
                $destinations = [];
                foreach ($this->listAt($state, 'transitions_to') as $id) {
                    $destinations[] = $names[$id] ?? '?';
                }
                sort($destinations);

                return $destinations;
            }
        }

        self::fail('No state called ' . $name);
    }

    /**
     * @param array<array-key, mixed> $data
     * @return list<string>
     */
    private function listAt(array $data, string $key): array
    {
        $list = $data[$key] ?? [];
        self::assertIsArray($list);

        $strings = [];
        foreach ($list as $item) {
            self::assertIsString($item);
            $strings[] = $item;
        }

        return $strings;
    }

    /** Puts both flows back to what the migration seeds, so no test depends on what another one left. */
    private function resetFlows(): void
    {
        $this->connection->executeStatement('DELETE FROM workflow_transitions');
        $this->connection->executeStatement('DELETE FROM workflow_states');
        $this->applyMigrationAgain(self::MIGRATION);
    }
}
