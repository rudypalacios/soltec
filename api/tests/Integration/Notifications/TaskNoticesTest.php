<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Notifications;

/**
 * Who is told of what in a task (ADR-0031): the owner and the assignee of every change of it, a mentioned person of the
 * mention, and nobody of what they did themselves.
 */
final class TaskNoticesTest extends NotificationsTestCase
{
    public function testAssigningATaskTellsTheAssigneeAndNotTheOwner(): void
    {
        $task = $this->newTask();

        self::assertSame(['assigned'], $this->typesFor($this->assignee));
        self::assertSame([], $this->typesFor($this->owner));
        $notice = $this->noticesFor($this->assignee)[0];
        self::assertSame('task', $this->text($notice, 'subject', 'type'));
        self::assertSame($this->text($task, 'id'), $this->text($notice, 'subject', 'id'));
        self::assertSame('Instalar el equipo', $this->text($notice, 'subject', 'title'));
        self::assertSame($this->owner['id'], $this->text($notice, 'actor', 'id'));
        self::assertFalse($notice['is_read']);
    }

    public function testATaskAssignedToItsOwnerTellsNobody(): void
    {
        $this->newTask(['assignee_id' => $this->owner['id']]);

        self::assertSame([], $this->typesFor($this->owner));
    }

    public function testTheEmailGoesOutOnceWithALinkAndNeverTheTextOfAComment(): void
    {
        $id = $this->text($this->newTask(), 'id');
        $this->comment($id, $this->assignee, 'Texto secreto del comentario');

        self::assertCount(2, $this->mail->sent);
        [$assigned, $commented] = $this->mail->sent;
        self::assertSame('assignee@example.com', $assigned->to);
        self::assertStringContainsString('Olga Owner te asignó la tarea «Instalar el equipo».', $assigned->body);
        self::assertStringContainsString('https://app.example.test/tareas/' . $id, $assigned->body);
        self::assertSame('owner@example.com', $commented->to);
        self::assertStringNotContainsString('Texto secreto', $commented->body);
        self::assertSame(
            ['sent', 'sent'],
            $this->connection->fetchFirstColumn('SELECT email_status FROM notifications ORDER BY id'),
        );
    }

    public function testACommentTellsTheOtherPersonOfTheTaskAndNotTheAuthor(): void
    {
        $id = $this->text($this->newTask(), 'id');

        $this->comment($id, $this->assignee, 'Ya voy en camino');
        $this->comment($id, $this->owner, 'Gracias');

        self::assertSame(['comment', 'assigned'], $this->typesFor($this->assignee));
        self::assertSame(['comment'], $this->typesFor($this->owner));
    }

    public function testAMentionedPersonIsToldOfTheMentionAndAParticipantMentionedIsNotToldTwice(): void
    {
        $id = $this->text($this->newTask(), 'id');

        $this->comment($id, $this->assignee, sprintf('Hola @[%s] y @[%s]', $this->stranger['id'], $this->owner['id']));

        self::assertSame(['mention'], $this->typesFor($this->stranger));
        self::assertSame(['mention'], $this->typesFor($this->owner));
        self::assertSame(['assigned'], $this->typesFor($this->assignee));
        // The stranger reaches the task now, and the link in their notice opens it.
        self::assertSame(200, $this->api('GET', '/tasks/' . $id, $this->stranger['token'])->getStatusCode());
    }

    public function testEditingACommentTellsOnlyThePeopleNewlyMentionedAndWithdrawsTheRemovedOnes(): void
    {
        $id = $this->text($this->newTask(), 'id');
        $entryId = $this->comment($id, $this->owner, sprintf('Mira @[%s]', $this->stranger['id']));
        self::assertSame(['mention'], $this->typesFor($this->stranger));

        $entry = $this->json($this->api('GET', '/tasks/' . $id . '/thread', $this->owner['token']));
        $comment = $this->rowsAt($entry, 'data')[0];
        $edited = $this->api('PATCH', '/thread-entries/' . $entryId, $this->owner['token'], [
            'version' => $this->versionOf($comment),
            'body' => sprintf('Mira @[%s]', $this->assignee['id']),
        ]);

        self::assertSame(200, $edited->getStatusCode(), (string) $edited->getBody());
        self::assertSame([], $this->typesFor($this->stranger));
        self::assertSame('mention', $this->typesFor($this->assignee)[0]);
    }

    public function testDeactivatingACommentWithdrawsItsNotices(): void
    {
        $id = $this->text($this->newTask(), 'id');
        $entryId = $this->comment($id, $this->owner, sprintf('Mira @[%s]', $this->stranger['id']));
        self::assertSame(['comment', 'assigned'], $this->typesFor($this->assignee));

        $response = $this->api('POST', '/thread-entries/' . $entryId . '/deactivate', $this->owner['token']);

        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(['assigned'], $this->typesFor($this->assignee));
        self::assertSame([], $this->typesFor($this->stranger));
    }

    public function testAChangeOfStateTellsTheOtherPersonWhateverTheState(): void
    {
        $id = $this->text($this->newTask(), 'id');

        $this->moveTask($id, 'Aceptada');
        $this->moveTask($id, 'En ejecución');
        $this->moveTask($id, 'Completada');
        $this->moveTask($id, 'Cerrada', $this->owner['token']);

        self::assertSame(['state_changed', 'state_changed', 'state_changed'], $this->typesFor($this->owner));
        self::assertSame(['state_changed', 'assigned'], $this->typesFor($this->assignee));
        $notice = $this->noticesFor($this->assignee)[0];
        self::assertSame('Completada', $this->text($notice, 'data', 'from'));
        self::assertSame('Cerrada', $this->text($notice, 'data', 'to'));
    }

    public function testChangingTheAssigneeTellsTheNewOneTheOldOneAndTheOwnerExceptWhoDidIt(): void
    {
        $id = $this->text($this->newTask(), 'id');
        $admin = $this->createAdmin('admin@example.com');
        $token = $this->tokenFor($admin['id']);

        // An administrator hands the task to a third person: all three of the task are told.
        $this->editTask($id, ['assignee_id' => $this->stranger['id']], $token);

        self::assertSame(['assigned'], $this->typesFor($this->stranger));
        self::assertSame(['unassigned', 'assigned'], $this->typesFor($this->assignee));
        self::assertSame(['assignee_changed'], $this->typesFor($this->owner));
        $notice = $this->noticesFor($this->owner)[0];
        self::assertSame('Andrés Asignado', $this->text($notice, 'data', 'from'));
        self::assertSame('Sara Ajena', $this->text($notice, 'data', 'to'));
        self::assertSame($admin['id'], $this->text($notice, 'actor', 'id'));

        // The owner takes it back: the owner, who did it, is not told.
        $this->editTask($id, ['assignee_id' => $this->assignee['id']]);
        self::assertSame(['unassigned', 'assigned'], $this->typesFor($this->stranger));
        self::assertSame(['assignee_changed'], $this->typesFor($this->owner));
    }

    public function testChangingTheDueDateTellsTheAssigneeAndNotTheOwnerWhoDidIt(): void
    {
        $id = $this->text($this->newTask(), 'id');

        $this->editTask($id, ['due_date' => '2026-12-20']);

        self::assertSame(['due_date_changed', 'assigned'], $this->typesFor($this->assignee));
        self::assertSame([], $this->typesFor($this->owner));
        $notice = $this->noticesFor($this->assignee)[0];
        self::assertSame('2026-12-15', $this->text($notice, 'data', 'from'));
        self::assertSame('2026-12-20', $this->text($notice, 'data', 'to'));
    }

    public function testAnEmailThatFailsIsRecordedAndNeverBreaksTheChange(): void
    {
        $this->mail->failWith(new \Soltec\Kernel\Mail\MailException('SMTP Error: limit reached'));

        $response = $this->createTask();

        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(['assigned'], $this->typesFor($this->assignee));
        $row = $this->connection->fetchAssociative('SELECT email_status, email_error FROM notifications');
        self::assertIsArray($row);
        self::assertSame('failed', $row['email_status']);
        self::assertSame('SMTP Error: limit reached', $row['email_error']);
    }
}
