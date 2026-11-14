<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Tasks;

use Soltec\Kernel\Uuid;

/** `GET /v1/tasks/board`: the columns of the flow with their totals and a page of tasks each. */
final class TaskBoardTest extends TasksTestCase
{
    private const SEED = '20261030000002';
    private const COLUMNS = '20261114000001';

    private string $adminToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminToken = $this->tokenFor($this->createAdmin()['id']);
    }

    protected function tearDown(): void
    {
        // Tests change the arrangement and the states of the flow: put them back for the next class.
        foreach (['thread_entry_files', 'thread_entry_mentions', 'thread_entries', 'tasks'] as $table) {
            $this->connection->executeStatement('DELETE FROM ' . $table);
        }
        $this->connection->executeStatement('DELETE FROM workflow_transitions');
        $this->connection->executeStatement('DELETE FROM workflow_states');
        $this->connection->executeStatement('DELETE FROM board_columns');
        $this->connection->executeStatement('ALTER TABLE workflow_states MODIFY board_column_id BINARY(16) NULL');
        $this->applyMigrationAgain(self::SEED);
        $this->applyMigrationAgain(self::COLUMNS);
        parent::tearDown();
    }

    public function testShowsOneColumnPerStateAtFirstEvenWhenEmpty(): void
    {
        $board = $this->board();

        self::assertSame(
            ['Asignada', 'Aceptada', 'En ejecución', 'Completada', 'Cerrada', 'Rechazada'],
            array_column($board, 'name'),
        );
        self::assertSame([0, 0, 0, 0, 0, 0], array_column($board, 'total'));
        self::assertSame([[], [], [], [], [], []], array_column($board, 'tasks'));
        self::assertSame([false, false, false, false, true, false], array_column($board, 'is_final'));
    }

    public function testPutsEachTaskInTheColumnOfItsStateOrderedByDueDate(): void
    {
        $late = $this->newTask(['title' => 'Tarde', 'due_date' => '2026-12-30']);
        $soon = $this->newTask(['title' => 'Pronto', 'due_date' => '2026-12-01']);
        $moved = $this->newTask(['title' => 'Aceptada', 'due_date' => '2026-12-10']);
        $this->move($moved, 'Aceptada');

        $board = $this->board();

        self::assertSame(2, $this->column($board, 'Asignada')['total']);
        self::assertSame(['Pronto', 'Tarde'], $this->titles($this->column($board, 'Asignada')));
        self::assertSame(['Aceptada'], $this->titles($this->column($board, 'Aceptada')));
        self::assertSame(1, $this->column($board, 'Aceptada')['total']);
        self::assertSame($soon['id'], $this->rowsAt($this->column($board, 'Asignada'), 'tasks')[0]['id']);
        self::assertNotSame($late['id'], $soon['id']);
    }

    public function testAColumnGroupsTheTasksOfAllItsStates(): void
    {
        $accepted = $this->newTask(['title' => 'A', 'due_date' => '2026-12-02']);
        $running = $this->newTask(['title' => 'B', 'due_date' => '2026-12-01']);
        $this->move($accepted, 'Aceptada');
        $this->move($running, 'Aceptada');
        $this->move($running, 'En ejecución');
        $this->replaceColumns([
            ['id' => $this->columnId('Asignada'), 'name' => 'Por hacer', 'states' => ['Asignada', 'Rechazada']],
            ['id' => $this->columnId('Aceptada'), 'name' => 'En curso', 'states' => ['Aceptada', 'En ejecución']],
            ['id' => $this->columnId('Completada'), 'name' => 'Completada', 'states' => ['Completada']],
            ['id' => $this->columnId('Cerrada'), 'name' => 'Cerrada', 'states' => ['Cerrada']],
        ]);

        $board = $this->board();

        self::assertSame(['Por hacer', 'En curso', 'Completada', 'Cerrada'], array_column($board, 'name'));
        $column = $this->column($board, 'En curso');
        self::assertSame(2, $column['total']);
        self::assertSame(['B', 'A'], $this->titles($column));
        self::assertSame(
            ['En ejecución', 'Aceptada'],
            array_map(
                fn (array $task): string => $this->text($task, 'state', 'name'),
                $this->rowsAt($column, 'tasks'),
            ),
        );
    }

    public function testPagesEachColumnAndAsksForOneColumnOnly(): void
    {
        foreach ([1, 2, 3] as $day) {
            $this->newTask(['title' => 'Tarea ' . $day, 'due_date' => '2026-12-0' . $day]);
        }
        $other = $this->newTask(['title' => 'Otra', 'due_date' => '2026-12-09']);
        $this->move($other, 'Aceptada');

        $first = $this->board('?per_page=2');
        self::assertSame(3, $this->column($first, 'Asignada')['total']);
        self::assertSame(['Tarea 1', 'Tarea 2'], $this->titles($this->column($first, 'Asignada')));
        self::assertSame(['Otra'], $this->titles($this->column($first, 'Aceptada')));

        $second = $this->board('?per_page=2&page=2&column_id=' . $this->columnId('Asignada'));
        self::assertCount(1, $second);
        self::assertSame(3, $second[0]['total']);
        self::assertSame(['Tarea 3'], $this->titles($second[0]));

        $unknown = $this->api(
            'GET',
            '/tasks/board?column_id=0192a1b2-0000-7000-8000-000000000000',
            $this->owner['token'],
        );
        self::assertSame(404, $unknown->getStatusCode());
        $bad = $this->api('GET', '/tasks/board?per_page=101', $this->owner['token']);
        self::assertSame(422, $bad->getStatusCode());
    }

    public function testAColumnWithAFinalStateListsTheLatestChangeFirst(): void
    {
        $older = $this->newTask(['title' => 'Antigua', 'due_date' => '2026-12-01']);
        $newer = $this->newTask(['title' => 'Reciente', 'due_date' => '2026-12-30']);
        foreach ([$older, $newer] as $task) {
            foreach (['Aceptada', 'En ejecución', 'Completada'] as $state) {
                $this->move($task, $state);
            }
            $this->move($task, 'Cerrada', $this->owner['token']);
        }
        $this->connection->executeStatement(
            "UPDATE tasks SET updated_at = '2026-11-01 10:00:00.000' WHERE id = UNHEX(:id)",
            ['id' => Uuid::toHex($this->text($older, 'id'))],
        );
        $this->connection->executeStatement(
            "UPDATE tasks SET updated_at = '2026-11-02 10:00:00.000' WHERE id = UNHEX(:id)",
            ['id' => Uuid::toHex($this->text($newer, 'id'))],
        );

        self::assertSame(['Reciente', 'Antigua'], $this->titles($this->column($this->board(), 'Cerrada')));
    }

    public function testShowsOnlyWhatTheCallerReachesAndHonorsTheFilters(): void
    {
        $this->newTask(['title' => 'Cableado']);
        $this->newTask(['title' => 'Cotización']);
        $other = $this->person('other@example.com', 'Otro Dueño');
        $this->createTask($other['token'], ['title' => 'Ajena', 'assignee_id' => $other['id']]);

        $mine = $this->column($this->board(), 'Asignada');
        self::assertSame(2, $mine['total']);
        self::assertSame(['Cableado', 'Cotización'], $this->titles($mine));
        self::assertSame(0, $this->column($this->board('', $this->stranger['token']), 'Asignada')['total']);
        self::assertSame(2, $this->column($this->board('', $this->assignee['token']), 'Asignada')['total']);

        self::assertSame(['Cableado'], $this->titles($this->column($this->board('?q=cable'), 'Asignada')));
        self::assertSame(0, $this->column($this->board('?relation=assigned'), 'Asignada')['total']);
        self::assertSame(2, $this->column($this->board('?relation=owned', $this->owner['token']), 'Asignada')['total']);
    }

    public function testInactiveTasksAreAFilterAndNotOnTheBoardByDefault(): void
    {
        $task = $this->newTask(['title' => 'Vieja']);
        $this->api('POST', '/tasks/' . $this->text($task, 'id') . '/deactivate', $this->owner['token']);

        self::assertSame(0, $this->column($this->board(), 'Asignada')['total']);
        self::assertSame(['Vieja'], $this->titles($this->column($this->board('?status=inactive'), 'Asignada')));
        self::assertSame(1, $this->column($this->board('?status=all'), 'Asignada')['total']);
    }

    public function testAnInactiveStateKeepsItsTasksInItsColumnAndAnEmptyOneDisappears(): void
    {
        $rejected = $this->newTask(['title' => 'Rechazada']);
        $this->move($rejected, 'Rechazada');
        $this->deactivateState('Rechazada');
        $this->deactivateState('Aceptada');

        $board = $this->board();

        self::assertSame(
            ['Asignada', 'En ejecución', 'Completada', 'Cerrada', 'Rechazada'],
            array_column($board, 'name'),
        );
        self::assertSame(['Rechazada'], $this->titles($this->column($board, 'Rechazada')));
    }

    public function testRequiresASession(): void
    {
        self::assertSame(401, $this->api('GET', '/tasks/board')->getStatusCode());
    }

    /** @param array<string, mixed> $task */
    private function move(array $task, string $state, ?string $token = null): void
    {
        $id = $this->text($task, 'id');
        $current = $this->json($this->api('GET', '/tasks/' . $id, $this->owner['token']));
        $response = $this->api('POST', '/tasks/' . $id . '/transition', $token ?? $this->assignee['token'], [
            'version' => $this->versionOf($current),
            'state_id' => $this->stateId($state),
        ]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
    }

    /** @return list<array<string, mixed>> */
    private function board(string $query = '', ?string $token = null): array
    {
        $response = $this->api('GET', '/tasks/board' . $query, $token ?? $this->owner['token']);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());

        return $this->rowsAt($this->json($response), 'data');
    }

    /**
     * @param list<array<string, mixed>> $board
     * @return array<string, mixed>
     */
    private function column(array $board, string $name): array
    {
        foreach ($board as $column) {
            if ($column['name'] === $name) {
                return $column;
            }
        }

        self::fail('The board has no column called ' . $name);
    }

    /**
     * @param array<string, mixed> $column
     * @return list<string>
     */
    private function titles(array $column): array
    {
        return array_map(
            fn (array $task): string => $this->text($task, 'title'),
            $this->rowsAt($column, 'tasks'),
        );
    }

    private function columnId(string $name): string
    {
        $response = $this->api('GET', '/workflows/task/board-columns', $this->adminToken);

        return $this->text($this->column($this->rowsAt($this->json($response), 'data'), $name), 'id');
    }

    /** @param list<array{id: string, name: string, states: list<string>}> $columns */
    private function replaceColumns(array $columns): void
    {
        $body = [];
        foreach ($columns as $column) {
            $body[] = [
                'id' => $column['id'],
                'name' => $column['name'],
                'state_ids' => array_map($this->stateId(...), $column['states']),
            ];
        }
        $response = $this->api('PUT', '/workflows/task/board-columns', $this->adminToken, ['columns' => $body]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
    }

    private function deactivateState(string $name): void
    {
        $response = $this->api(
            'POST',
            '/workflows/task/states/' . $this->stateId($name) . '/deactivate',
            $this->adminToken,
        );
        self::assertSame(200, $response->getStatusCode());
    }
}
