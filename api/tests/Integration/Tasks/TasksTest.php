<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Tasks;

final class TasksTest extends TasksTestCase
{
    public function testCreatesATaskOwnedByTheCallerInTheInitialStateAndLeavesItsFirstEventInTheThread(): void
    {
        $response = $this->createTask(null, ['owner_id' => $this->stranger['id'], 'title' => '  Instalar  ']);

        self::assertSame(201, $response->getStatusCode());
        $task = $this->json($response);
        self::assertSame('Instalar', $task['title']);
        self::assertSame($this->owner['id'], $this->valueAt($task, 'owner', 'id'));
        self::assertSame($this->assignee['id'], $this->valueAt($task, 'assignee', 'id'));
        self::assertSame('2026-12-15', $task['due_date']);
        self::assertSame('Asignada', $this->valueAt($task, 'state', 'name'));
        self::assertSame('Ventas', $this->valueAt($task, 'task_type', 'name'));
        self::assertNull($task['proposed_due_date']);
        self::assertTrue($task['is_active']);
        self::assertSame(['Aceptada', 'Rechazada'], $this->columnAt($task, 'name', 'next_states'));

        $path = '/tasks/' . $this->text($task, 'id') . '/thread';
        $thread = $this->json($this->api('GET', $path, $this->owner['token']));
        self::assertSame(['event'], $this->columnAt($thread, 'kind', 'data'));
        self::assertSame('created', $this->valueAt($this->rowsAt($thread, 'data')[0], 'event', 'type'));

        $audit = $this->auditEntries('tasks', $this->text($task, 'id'));
        self::assertSame(['create'], array_column($audit, 'action'));
    }

    public function testValidatesTheFieldsAndTheReferences(): void
    {
        $missing = $this->api('POST', '/tasks', $this->owner['token'], []);
        self::assertSame(
            [
                'title' => 'required',
                'task_type_id' => 'required',
                'assignee_id' => 'required',
                'due_date' => 'required',
            ],
            $this->errorCodes($missing),
        );

        $bad = $this->createTask(null, [
            'title' => str_repeat('a', 151),
            'due_date' => '2026-02-30',
            'description' => str_repeat('d', 5001),
        ]);
        self::assertSame(
            ['title' => 'too_long', 'description' => 'too_long', 'due_date' => 'invalid'],
            $this->errorCodes($bad),
        );

        self::assertSame(
            ['assignee_id' => 'not_found'],
            $this->errorCodes($this->createTask(null, ['assignee_id' => '0192a1b2-0000-7000-8000-000000000000'])),
        );
        self::assertSame(
            ['task_type_id' => 'not_found'],
            $this->errorCodes($this->createTask(null, ['task_type_id' => '0192a1b2-0000-7000-8000-000000000000'])),
        );
    }

    public function testATaskIsReachedByItsOwnerAndItsAssigneeAndByNobodyElseWithTheOwnScope(): void
    {
        $task = $this->newTask();
        $path = '/tasks/' . $this->text($task, 'id');

        self::assertSame(200, $this->api('GET', $path, $this->owner['token'])->getStatusCode());
        self::assertSame(200, $this->api('GET', $path, $this->assignee['token'])->getStatusCode());
        self::assertSame(404, $this->api('GET', $path, $this->stranger['token'])->getStatusCode());

        foreach ([$this->owner, $this->assignee] as $person) {
            $list = $this->json($this->api('GET', '/tasks', $person['token']));
            self::assertSame([$this->text($task, 'id')], $this->columnAt($list, 'id', 'data'));
        }
        $none = $this->json($this->api('GET', '/tasks', $this->stranger['token']));
        self::assertSame([], $this->rowsAt($none, 'data'));
    }

    public function testTheListFiltersByRelationStateTextAndDueDate(): void
    {
        $this->newTask(['title' => 'Cotizar cableado', 'due_date' => '2026-12-20']);
        $this->newTask(['title' => 'Cobrar factura', 'due_date' => '2026-11-01']);

        $asked = $this->json($this->api('GET', '/tasks?relation=owned', $this->owner['token']));
        self::assertSame(['Cobrar factura', 'Cotizar cableado'], $this->columnAt($asked, 'title', 'data'));
        $mine = $this->json($this->api('GET', '/tasks?relation=assigned', $this->owner['token']));
        self::assertSame([], $this->rowsAt($mine, 'data'));

        $found = $this->json($this->api('GET', '/tasks?q=cablea', $this->owner['token']));
        self::assertSame(['Cotizar cableado'], $this->columnAt($found, 'title', 'data'));
        $late = $this->json($this->api('GET', '/tasks?due_before=2026-12-01&open_only=true', $this->owner['token']));
        self::assertSame(['Cobrar factura'], $this->columnAt($late, 'title', 'data'));

        $state = $this->stateId('Aceptada');
        $none = $this->json($this->api('GET', '/tasks?state_id=' . $state, $this->owner['token']));
        self::assertSame([], $this->rowsAt($none, 'data'));
        self::assertSame(422, $this->api('GET', '/tasks?due_before=mañana', $this->owner['token'])->getStatusCode());
    }

    public function testTheAssigneeWalksTheFlowAndOnlyTheOwnerClosesIt(): void
    {
        $task = $this->newTask();
        $path = '/tasks/' . $this->text($task, 'id');
        $version = 1;
        $current = 'Asignada';
        foreach (['Aceptada', 'En ejecución', 'Completada'] as $name) {
            $moved = $this->api('POST', $path . '/transition', $this->assignee['token'], [
                'state_id' => $this->stateId($name),
                'version' => $version,
            ]);
            self::assertSame(200, $moved->getStatusCode(), $current . ' -> ' . $name);
            $version = $this->versionOf($this->json($moved));
            $current = $name;
        }

        // The assignee cannot close it; the next states they are offered leave the closing step out.
        $shown = $this->json($this->api('GET', $path, $this->assignee['token']));
        self::assertSame(['En ejecución'], $this->columnAt($shown, 'name', 'next_states'));
        $denied = $this->api('POST', $path . '/transition', $this->assignee['token'], [
            'state_id' => $this->stateId('Cerrada'),
            'version' => $version,
        ]);
        self::assertSame(403, $denied->getStatusCode());

        $closed = $this->api('POST', $path . '/transition', $this->owner['token'], [
            'state_id' => $this->stateId('Cerrada'),
            'version' => $version,
        ]);
        self::assertSame(200, $closed->getStatusCode());
        self::assertTrue($this->valueAt($this->json($closed), 'state', 'is_terminal'));

        $thread = $this->json($this->api('GET', $path . '/thread?limit=10', $this->owner['token']));
        self::assertSame(
            ['state_changed', 'state_changed', 'state_changed', 'state_changed', 'created'],
            $this->eventTypes($thread),
        );
        self::assertSame('Cerrada', $this->valueAt($this->rowsAt($thread, 'data')[0], 'event', 'data', 'to', 'name'));
    }

    public function testATaskCanBeAssignedToItsOwnerWhoThenMovesItThroughTheWholeFlow(): void
    {
        $task = $this->newTask(['assignee_id' => $this->owner['id']]);
        self::assertSame($this->owner['id'], $this->valueAt($task, 'assignee', 'id'));
        $path = '/tasks/' . $this->text($task, 'id');

        $version = $this->versionOf($task);
        foreach (['Aceptada', 'En ejecución', 'Completada', 'Cerrada'] as $name) {
            $moved = $this->api('POST', $path . '/transition', $this->owner['token'], [
                'state_id' => $this->stateId($name),
                'version' => $version,
            ]);
            self::assertSame(200, $moved->getStatusCode(), $name);
            $version = $this->versionOf($this->json($moved));
        }
        // A task that is its owner's own is reached by nobody else with the own scope.
        self::assertSame(404, $this->api('GET', $path, $this->assignee['token'])->getStatusCode());
    }

    public function testRefusesAStateTheFlowDoesNotLink(): void
    {
        $task = $this->newTask();
        $response = $this->api('POST', '/tasks/' . $this->text($task, 'id') . '/transition', $this->assignee['token'], [
            'state_id' => $this->stateId('Completada'),
            'version' => 1,
        ]);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame(['state_id' => 'transition_not_allowed'], $this->errorCodes($response));
    }

    public function testAStrangerCannotMoveATaskTheyDoNotReach(): void
    {
        $task = $this->newTask();
        $response = $this->api('POST', '/tasks/' . $this->text($task, 'id') . '/transition', $this->stranger['token'], [
            'state_id' => $this->stateId('Aceptada'),
            'version' => 1,
        ]);

        self::assertSame(404, $response->getStatusCode());
    }

    public function testRejectingKeepsTheProposedDateAndTheOwnerCanAcceptIt(): void
    {
        $task = $this->newTask();
        $path = '/tasks/' . $this->text($task, 'id');

        $rejected = $this->json($this->api('POST', $path . '/transition', $this->assignee['token'], [
            'state_id' => $this->stateId('Rechazada'),
            'version' => 1,
            'reason' => 'No hay material',
            'proposed_due_date' => '2026-12-30',
        ]));
        self::assertSame('Rechazada', $this->valueAt($rejected, 'state', 'name'));
        self::assertSame('2026-12-30', $rejected['proposed_due_date']);

        $accepted = $this->json($this->api('POST', $path . '/transition', $this->owner['token'], [
            'state_id' => $this->stateId('Asignada'),
            'version' => $rejected['version'],
            'accept_proposed_due_date' => true,
        ]));
        self::assertSame('Asignada', $this->valueAt($accepted, 'state', 'name'));
        self::assertSame('2026-12-30', $accepted['due_date']);
        self::assertNull($accepted['proposed_due_date']);

        $thread = $this->json($this->api('GET', $path . '/thread', $this->owner['token']));
        $types = $this->eventTypes($thread);
        self::assertContains('due_date_changed', $types);
        $rejection = array_values(array_filter(
            $this->rowsAt($thread, 'data'),
            fn (array $entry): bool => $this->valueAt($entry, 'event', 'data', 'reason') === 'No hay material',
        ));
        self::assertCount(1, $rejection);
    }

    public function testChangingTheAssigneeAndTheDueDateLeavesEventsAndAuditsTheChange(): void
    {
        $task = $this->newTask();
        $path = '/tasks/' . $this->text($task, 'id');
        $other = $this->person('other@example.com', 'Otto Otro');

        $updated = $this->api('PATCH', $path, $this->owner['token'], [
            'version' => 1,
            'title' => 'Instalar el equipo',
            'description' => null,
            'task_type_id' => $this->typeId('Servicios'),
            'assignee_id' => $other['id'],
            'due_date' => '2027-01-05',
        ]);

        self::assertSame(200, $updated->getStatusCode(), (string) $updated->getBody());
        $body = $this->json($updated);
        self::assertSame($other['id'], $this->valueAt($body, 'assignee', 'id'));
        self::assertNull($body['description']);
        self::assertSame(2, $body['version']);

        $thread = $this->json($this->api('GET', $path . '/thread', $this->owner['token']));
        $types = $this->eventTypes($thread);
        self::assertEqualsCanonicalizing(['created', 'assignee_changed', 'due_date_changed'], $types);

        $audit = $this->auditEntries('tasks', $this->text($task, 'id'));
        self::assertSame(['create', 'update'], array_column($audit, 'action'));
        self::assertSame($other['id'], $this->valueAt($audit[1], 'after', 'assignee_id'));
        // The previous assignee no longer reaches the task with the own scope.
        self::assertSame(404, $this->api('GET', $path, $this->assignee['token'])->getStatusCode());
    }

    public function testAStaleVersionAndAClosedTaskCannotBeChanged(): void
    {
        $task = $this->newTask();
        $path = '/tasks/' . $this->text($task, 'id');
        $body = [
            'version' => 7,
            'title' => 'Otro',
            'description' => null,
            'task_type_id' => $this->typeId(),
            'assignee_id' => $this->assignee['id'],
            'due_date' => '2026-12-15',
        ];
        self::assertSame(409, $this->api('PATCH', $path, $this->owner['token'], $body)->getStatusCode());

        $this->connection->executeStatement(
            'UPDATE tasks SET state_id = UNHEX(:state)',
            ['state' => \Soltec\Kernel\Uuid::toHex($this->stateId('Cerrada'))],
        );
        $closed = $this->api('PATCH', $path, $this->owner['token'], ['version' => 1] + $body);
        self::assertSame(409, $closed->getStatusCode());
        self::assertSame('task_closed', $this->json($closed)['code'] ?? null);
    }

    public function testDeactivatesAndReactivatesIdempotentlyAndAnInactiveTaskDoesNotMove(): void
    {
        $task = $this->newTask();
        $path = '/tasks/' . $this->text($task, 'id');

        foreach ([1, 2] as $attempt) {
            $off = $this->api('POST', $path . '/deactivate', $this->owner['token']);
            self::assertSame(200, $off->getStatusCode(), 'attempt ' . $attempt);
            self::assertFalse($this->json($off)['is_active']);
        }
        self::assertSame([], $this->rowsAt($this->json($this->api('GET', '/tasks', $this->owner['token'])), 'data'));
        $inactive = $this->json($this->api('GET', '/tasks?status=inactive', $this->owner['token']));
        self::assertCount(1, $this->rowsAt($inactive, 'data'));

        $moved = $this->api('POST', $path . '/transition', $this->assignee['token'], [
            'state_id' => $this->stateId('Aceptada'),
            'version' => $this->json($this->api('GET', $path, $this->owner['token']))['version'],
        ]);
        self::assertSame(409, $moved->getStatusCode());

        $on = $this->json($this->api('POST', $path . '/reactivate', $this->owner['token']));
        self::assertTrue($on['is_active']);
        self::assertSame(
            ['create', 'deactivate', 'reactivate'],
            array_column($this->auditEntries('tasks', $this->text($task, 'id')), 'action'),
        );
    }

    public function testEachActionNeedsItsPermissionAndTheScopeWidensWhatIsReached(): void
    {
        $viewer = $this->tokenWith('tasks', 'view');
        self::assertSame(403, $this->createTask($viewer)->getStatusCode());
        self::assertSame(401, $this->api('GET', '/tasks')->getStatusCode());

        $task = $this->newTask();
        // `all` reaches a task the user neither owns nor was assigned.
        self::assertSame(200, $this->api('GET', '/tasks/' . $this->text($task, 'id'), $viewer)->getStatusCode());
        self::assertSame(
            403,
            $this->api('POST', '/tasks/' . $this->text($task, 'id') . '/deactivate', $viewer)->getStatusCode(),
        );
    }

    public function testTheTypesAreACatalogWithAnOptionsList(): void
    {
        $options = $this->json($this->api('GET', '/task-types/options', $this->owner['token']));
        self::assertCount(9, $this->rowsAt($options, 'data'));
        self::assertContains('Emergencia', $this->columnAt($options, 'name', 'data'));
    }

    public function testTheMigrationCanBeRepeatedWithoutDuplicatingTheTypes(): void
    {
        $this->applyMigrationAgain('20261110000001');

        self::assertSame(9, $this->countRows('SELECT COUNT(*) FROM task_types'));
    }
}
