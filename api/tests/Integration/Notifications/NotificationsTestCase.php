<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Notifications;

use Soltec\Tests\Integration\Tasks\TasksTestCase;

/** What the tests of notifications share: reading what a person was told, and the steps of a task. */
abstract class NotificationsTestCase extends TasksTestCase
{
    /**
     * The types of the notifications a person has, newest first.
     *
     * @param array{id: string, token: string} $person
     * @return list<string>
     */
    protected function typesFor(array $person, string $query = ''): array
    {
        return array_map(
            fn (array $notice): string => $this->text($notice, 'type'),
            $this->noticesFor($person, $query),
        );
    }

    /**
     * @param array{id: string, token: string} $person
     * @return list<array<string, mixed>>
     */
    protected function noticesFor(array $person, string $query = ''): array
    {
        $response = $this->api('GET', '/notifications' . $query, $person['token']);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());

        return $this->rowsAt($this->json($response), 'data');
    }

    /** Moves the clock and signs the three people in again: an access token does not outlive a few minutes. */
    protected function advance(string $interval): void
    {
        $this->clock->advance($interval);
        $this->owner['token'] = $this->tokenFor($this->owner['id']);
        $this->assignee['token'] = $this->tokenFor($this->assignee['id']);
        $this->stranger['token'] = $this->tokenFor($this->stranger['id']);
    }

    /** The assignee takes the task one step along its flow; the owner closes it. */
    protected function moveTask(string $taskId, string $state, ?string $token = null): void
    {
        $current = $this->json($this->api('GET', '/tasks/' . $taskId, $this->owner['token']));
        $response = $this->api('POST', '/tasks/' . $taskId . '/transition', $token ?? $this->assignee['token'], [
            'version' => $this->versionOf($current),
            'state_id' => $this->stateId($state),
        ]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
    }

    /**
     * @param array{id: string, token: string} $person
     * @param array<string, mixed> $data
     */
    protected function comment(string $taskId, array $person, string $body, array $data = []): string
    {
        $response = $this->api('POST', '/tasks/' . $taskId . '/thread', $person['token'], ['body' => $body] + $data);
        self::assertContains($response->getStatusCode(), [200, 201], (string) $response->getBody());

        return $this->text($this->json($response), 'id');
    }

    /** @param array<string, mixed> $changes */
    protected function editTask(string $taskId, array $changes, ?string $token = null): void
    {
        $current = $this->json($this->api('GET', '/tasks/' . $taskId, $this->owner['token']));
        $response = $this->api('PATCH', '/tasks/' . $taskId, $token ?? $this->owner['token'], $changes + [
            'version' => $this->versionOf($current),
            'title' => $this->text($current, 'title'),
            'description' => $current['description'] ?? null,
            'task_type_id' => $this->typeId(),
            'assignee_id' => $this->text($current, 'assignee', 'id'),
            'due_date' => $this->text($current, 'due_date'),
        ]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
    }
}
