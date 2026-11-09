<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Tasks;

use Psr\Http\Message\ResponseInterface;
use Soltec\Kernel\Uuid;
use Soltec\Tests\Integration\Access\AccessTestCase;

/** What the tests of tasks and of their thread share: people with roles, the seeded types and states. */
abstract class TasksTestCase extends AccessTestCase
{
    protected const OWN = ['view', 'create', 'edit', 'deactivate'];

    /** @var array{id: string, token: string} */
    protected array $owner;
    /** @var array{id: string, token: string} */
    protected array $assignee;
    /** @var array{id: string, token: string} */
    protected array $stranger;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = $this->person('owner@example.com', 'Olga Owner');
        $this->assignee = $this->person('assignee@example.com', 'Andrés Asignado');
        $this->stranger = $this->person('stranger@example.com', 'Sara Ajena');
    }

    /**
     * A person whose only role gives the tasks and the thread with the own scope: they reach what they asked for and
     * what they were asked.
     *
     * @return array{id: string, token: string}
     */
    protected function person(string $email, string $name): array
    {
        $role = $this->createRole('Tareas ' . $email, [
            'tasks' => self::OWN,
            'thread_entries' => self::OWN,
            'files' => ['view', 'create', 'deactivate'],
        ], ['tasks' => 'own', 'files' => 'own']);
        $user = $this->createUser($email, [$role], name: $name);

        return ['id' => $user['id'], 'token' => $this->tokenFor($user['id'])];
    }

    protected function typeId(string $name = 'Ventas'): string
    {
        return $this->idOf('task_types', $name);
    }

    protected function stateId(string $name): string
    {
        return $this->idOf('workflow_states', $name, "workflow_code = 'task' AND ");
    }

    /** @param array<string, mixed> $overrides */
    protected function createTask(?string $token = null, array $overrides = []): ResponseInterface
    {
        return $this->api('POST', '/tasks', $token ?? $this->owner['token'], $overrides + [
            'title' => 'Instalar el equipo',
            'description' => 'En la sucursal de la zona 10',
            'task_type_id' => $this->typeId(),
            'assignee_id' => $this->assignee['id'],
            'due_date' => '2026-12-15',
        ]);
    }

    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    protected function newTask(array $overrides = []): array
    {
        $response = $this->createTask(null, $overrides);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return $this->json($response);
    }

    /**
     * The type of each event of a thread page, newest first.
     *
     * @param array<string, mixed> $thread
     * @return list<string>
     */
    protected function eventTypes(array $thread): array
    {
        return array_map(
            fn (array $entry): string => $this->text($entry, 'event', 'type'),
            $this->rowsAt($thread, 'data'),
        );
    }

    /**
     * The version of a task or an entry in a decoded body.
     *
     * @param array<string, mixed> $body
     */
    protected function versionOf(array $body): int
    {
        $version = $body['version'] ?? null;
        self::assertIsInt($version);

        return $version;
    }

    private function idOf(string $table, string $name, string $where = ''): string
    {
        $hex = $this->connection->fetchOne(
            sprintf('SELECT LOWER(HEX(id)) FROM %s WHERE %sname = :name', $table, $where),
            ['name' => $name],
        );
        self::assertIsString($hex, 'Missing ' . $name);

        return Uuid::fromHex($hex);
    }
}
