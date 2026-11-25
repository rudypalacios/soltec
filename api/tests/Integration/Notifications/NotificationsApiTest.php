<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Notifications;

/** Reading, marking and polling one's own notifications, and the one setting of the module. */
final class NotificationsApiTest extends NotificationsTestCase
{
    public function testItNeedsASessionAndOnlyListsTheCallersOwn(): void
    {
        $this->newTask();

        self::assertSame(401, $this->api('GET', '/notifications')->getStatusCode());
        self::assertSame([], $this->noticesFor($this->owner));
        self::assertCount(1, $this->noticesFor($this->assignee));
    }

    public function testListsNewestFirstWithACursorAndTheUnreadCount(): void
    {
        foreach (['Uno', 'Dos', 'Tres'] as $title) {
            $this->newTask(['title' => $title]);
        }

        $first = $this->json($this->api('GET', '/notifications?limit=2', $this->assignee['token']));
        self::assertSame(['Tres', 'Dos'], $this->titles($first));
        self::assertSame(3, $this->valueAt($first, 'meta', 'unread_count'));
        $cursor = $this->text($first, 'meta', 'next_cursor');

        $second = $this->json($this->api('GET', '/notifications?limit=2&before=' . $cursor, $this->assignee['token']));
        self::assertSame(['Uno'], $this->titles($second));
        self::assertNull($this->valueAt($second, 'meta', 'next_cursor'));
    }

    public function testOpeningANoticeMarksItReadOnceAndNobodyElseCanTouchIt(): void
    {
        $this->newTask();
        $this->newTask(['title' => 'Otra']);
        $id = $this->text($this->noticesFor($this->assignee)[0], 'id');

        $read = $this->api('POST', '/notifications/' . $id . '/read', $this->assignee['token']);
        self::assertSame(200, $read->getStatusCode(), (string) $read->getBody());
        $body = $this->json($read);
        self::assertTrue($body['is_read']);
        $this->advance('+1 hour');
        $again = $this->json($this->api('POST', '/notifications/' . $id . '/read', $this->assignee['token']));
        self::assertSame($body['read_at'], $again['read_at']);

        $stranger = $this->api('POST', '/notifications/' . $id . '/read', $this->owner['token']);
        self::assertSame(404, $stranger->getStatusCode());
        self::assertCount(1, $this->noticesFor($this->assignee, '?unread=true'));
    }

    public function testMarkingAllReadClearsTheCounterAndSaysHowManyWereUnread(): void
    {
        $this->newTask();
        $this->newTask();

        $all = $this->json($this->api('POST', '/notifications/read-all', $this->assignee['token']));
        $none = $this->json($this->api('POST', '/notifications/read-all', $this->assignee['token']));

        self::assertSame(2, $all['marked']);
        self::assertSame(0, $none['marked']);
        self::assertSame([], $this->noticesFor($this->assignee, '?unread=true'));
        self::assertCount(2, $this->noticesFor($this->assignee));
    }

    public function testThePollingCountsUnreadAndWhatArrivedSinceTheLastLook(): void
    {
        $this->newTask();
        $first = $this->json($this->api('GET', '/updates', $this->assignee['token']));
        self::assertSame(1, $first['unread_count']);
        self::assertNull($first['new_count']);

        $this->advance('+1 minute');
        $this->newTask(['title' => 'Nueva']);
        $since = rawurlencode($this->text($first, 'server_time'));
        $second = $this->json($this->api('GET', '/updates?since=' . $since, $this->assignee['token']));

        self::assertSame(2, $second['unread_count']);
        self::assertSame(1, $second['new_count']);
        self::assertSame(422, $this->api('GET', '/updates?since=ayer', $this->assignee['token'])->getStatusCode());
    }

    public function testTheSettingsAreForWhoHasThePermissionAndAreAudited(): void
    {
        $admin = $this->tokenFor($this->createAdmin()['id']);

        self::assertSame(403, $this->api('GET', '/settings/notifications', $this->owner['token'])->getStatusCode());
        $current = $this->json($this->api('GET', '/settings/notifications', $admin));
        self::assertSame(8, $current['due_reminder_hour']);
        self::assertNull($current['last_run_at']);

        $updated = $this->api('PATCH', '/settings/notifications', $admin, [
            'version' => $current['version'],
            'due_reminder_hour' => 9,
        ]);
        self::assertSame(200, $updated->getStatusCode(), (string) $updated->getBody());
        self::assertSame(9, $this->json($updated)['due_reminder_hour']);
        self::assertSame(['update'], array_column($this->auditEntries('notification_settings'), 'action'));

        $stale = $this->api('PATCH', '/settings/notifications', $admin, [
            'version' => $current['version'],
            'due_reminder_hour' => 10,
        ]);
        self::assertSame(409, $stale->getStatusCode());
        $invalid = $this->api('PATCH', '/settings/notifications', $admin, [
            'version' => $this->versionOf($this->json($updated)),
            'due_reminder_hour' => 24,
        ]);
        self::assertSame(422, $invalid->getStatusCode());
    }

    /**
     * @param array<string, mixed> $page
     * @return list<string>
     */
    private function titles(array $page): array
    {
        return array_map(
            fn (array $notice): string => $this->text($notice, 'subject', 'title'),
            $this->rowsAt($page, 'data'),
        );
    }
}
