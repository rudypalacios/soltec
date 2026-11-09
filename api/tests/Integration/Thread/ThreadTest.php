<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Thread;

use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\UploadedFile;
use Soltec\Kernel\Paths;
use Soltec\Modules\Files\Application\FileStorage;
use Soltec\Modules\Files\Persistence\LocalFileStorage;
use Soltec\Tests\Integration\Tasks\TasksTestCase;

final class ThreadTest extends TasksTestCase
{
    private string $storageRoot = '';
    private string $taskId;
    private string $threadPath;

    protected function setUp(): void
    {
        parent::setUp();
        $this->taskId = $this->text($this->newTask(), 'id');
        $this->threadPath = '/tasks/' . $this->taskId . '/thread';
    }

    protected function tearDown(): void
    {
        if ($this->storageRoot !== '') {
            foreach (glob($this->storageRoot . '/storage/files/*/*') ?: [] as $file) {
                unlink($file);
            }
        }
        parent::tearDown();
    }

    /** @return array<string, mixed> */
    protected function containerDefinitions(): array
    {
        $this->storageRoot = sys_get_temp_dir() . '/soltec-thread-' . bin2hex(random_bytes(6));
        mkdir($this->storageRoot, 0700, true);

        return parent::containerDefinitions() + [
            FileStorage::class => new LocalFileStorage(new Paths($this->storageRoot)),
        ];
    }

    public function testWritesACommentAndListsTheThreadNewestFirstWithACursor(): void
    {
        foreach (['Uno', 'Dos', 'Tres'] as $text) {
            $created = $this->api('POST', $this->threadPath, $this->assignee['token'], ['body' => '  ' . $text . '  ']);
            self::assertSame(201, $created->getStatusCode());
        }
        $first = $this->json($this->api('POST', $this->threadPath, $this->owner['token'], ['body' => 'Cuatro']));
        self::assertSame('comment', $first['kind']);
        self::assertSame($this->owner['id'], $this->valueAt($first, 'author', 'id'));
        self::assertFalse($first['is_edited']);
        self::assertSame('internal', $first['visibility']);

        $page = $this->json($this->api('GET', $this->threadPath . '?limit=3', $this->owner['token']));
        self::assertSame(['Cuatro', 'Tres', 'Dos'], array_column($this->rowsAt($page, 'data'), 'body'));
        $cursor = $this->text($page, 'meta', 'next_cursor');

        $nextPath = $this->threadPath . '?limit=3&cursor=' . $cursor;
        $older = $this->json($this->api('GET', $nextPath, $this->owner['token']));
        self::assertSame(['Uno', null], array_column($this->rowsAt($older, 'data'), 'body'));
        self::assertNull($this->valueAt($older, 'meta', 'next_cursor'));
        self::assertSame(
            ['cursor' => 'invalid'],
            $this->errorCodes($this->api('GET', $this->threadPath . '?cursor=inventado', $this->owner['token'])),
        );
    }

    public function testANewCommentNeedsTextOrAPhotoAndIsLimited(): void
    {
        $empty = $this->api('POST', $this->threadPath, $this->owner['token'], ['body' => '   ']);
        self::assertSame(['body' => 'required'], $this->errorCodes($empty));
        $long = $this->api('POST', $this->threadPath, $this->owner['token'], ['body' => str_repeat('a', 5001)]);
        self::assertSame(['body' => 'too_long'], $this->errorCodes($long));
    }

    public function testOnlyWhoSeesTheTaskReadsOrWritesItsThread(): void
    {
        self::assertSame(404, $this->api('GET', $this->threadPath, $this->stranger['token'])->getStatusCode());
        $write = $this->api('POST', $this->threadPath, $this->stranger['token'], ['body' => 'Hola']);
        self::assertSame(404, $write->getStatusCode());
        $options = $this->api('GET', '/tasks/' . $this->taskId . '/mention-options', $this->stranger['token']);
        self::assertSame(404, $options->getStatusCode());

        $viewer = $this->tokenWith('tasks', 'view');
        self::assertSame(403, $this->api('POST', $this->threadPath, $viewer, ['body' => 'Hola'])->getStatusCode());
        self::assertSame(403, $this->api('GET', $this->threadPath, $viewer)->getStatusCode());
    }

    public function testAMentionIsStoredAndNamedAndOnlyPeopleWhoSeeTheTaskCanBeMentioned(): void
    {
        $mark = '@[' . $this->assignee['id'] . ']';
        $comment = $this->json($this->api('POST', $this->threadPath, $this->owner['token'], [
            'body' => 'Revisa esto ' . $mark . ' y ' . $mark,
        ]));
        self::assertSame(
            [['id' => $this->assignee['id'], 'name' => 'Andrés Asignado']],
            $comment['mentions'],
        );
        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM thread_entry_mentions'));

        $outsider = $this->api('POST', $this->threadPath, $this->owner['token'], [
            'body' => 'Hola @[' . $this->stranger['id'] . ']',
        ]);
        self::assertSame(['body' => 'invalid_mention'], $this->errorCodes($outsider));
        $unknown = $this->api('POST', $this->threadPath, $this->owner['token'], [
            'body' => 'Hola @[0192a1b2-0000-7000-8000-000000000000]',
        ]);
        self::assertSame(['body' => 'invalid_mention'], $this->errorCodes($unknown));
    }

    public function testTheMentionOptionsFilterByNameAndLeaveOutWhoCannotSeeTheTask(): void
    {
        $path = '/tasks/' . $this->taskId . '/mention-options';
        $all = $this->json($this->api('GET', $path, $this->owner['token']));
        self::assertEqualsCanonicalizing(
            ['Andrés Asignado', 'Olga Owner'],
            $this->columnAt($all, 'name', 'data'),
        );

        $filtered = $this->json($this->api('GET', $path . '?q=andr', $this->owner['token']));
        self::assertSame(['Andrés Asignado'], $this->columnAt($filtered, 'name', 'data'));
        $none = $this->json($this->api('GET', $path . '?q=ajena', $this->owner['token']));
        self::assertSame([], $this->rowsAt($none, 'data'));
    }

    public function testOnlyTheAuthorEditsAndTheAuditKeepsThePreviousText(): void
    {
        $comment = $this->json($this->api('POST', $this->threadPath, $this->assignee['token'], ['body' => 'Primero']));
        $entry = '/thread-entries/' . $this->text($comment, 'id');

        $other = $this->api('PATCH', $entry, $this->owner['token'], ['version' => 1, 'body' => 'Mío']);
        self::assertSame(403, $other->getStatusCode());
        $stale = $this->api('PATCH', $entry, $this->assignee['token'], ['version' => 5, 'body' => 'Tarde']);
        self::assertSame(409, $stale->getStatusCode());

        $edited = $this->json($this->api('PATCH', $entry, $this->assignee['token'], [
            'version' => 1,
            'body' => 'Segundo',
        ]));
        self::assertSame('Segundo', $edited['body']);
        self::assertTrue($edited['is_edited']);
        self::assertSame(2, $edited['version']);

        $audit = $this->auditEntries('thread_entries', $this->text($comment, 'id'));
        self::assertSame(['create', 'update'], array_column($audit, 'action'));
        self::assertSame('Primero', $this->valueAt($audit[1], 'before', 'body'));
    }

    public function testEventsAreNeverEditedOrDeactivatedByHand(): void
    {
        $thread = $this->json($this->api('GET', $this->threadPath, $this->owner['token']));
        $event = $this->text($this->rowsAt($thread, 'data')[0], 'id');

        $path = '/thread-entries/' . $event;
        $edit = $this->api('PATCH', $path, $this->owner['token'], ['version' => 1, 'body' => 'x']);
        self::assertSame(404, $edit->getStatusCode());
        self::assertSame(
            404,
            $this->api('POST', '/thread-entries/' . $event . '/deactivate', $this->owner['token'])->getStatusCode(),
        );
    }

    public function testOnlyTheAuthorDeactivatesAndTheCommentLeavesTheThread(): void
    {
        $comment = $this->json($this->api('POST', $this->threadPath, $this->assignee['token'], ['body' => 'Borrable']));
        $entry = '/thread-entries/' . $this->text($comment, 'id') . '/deactivate';

        self::assertSame(403, $this->api('POST', $entry, $this->owner['token'])->getStatusCode());
        foreach ([1, 2] as $attempt) {
            $off = $this->api('POST', $entry, $this->assignee['token']);
            self::assertSame(200, $off->getStatusCode(), 'attempt ' . $attempt);
            self::assertFalse($this->json($off)['is_active']);
        }
        $thread = $this->json($this->api('GET', $this->threadPath, $this->owner['token']));
        self::assertNotContains('Borrable', array_column($this->rowsAt($thread, 'data'), 'body'));
        self::assertSame(
            ['create', 'deactivate'],
            array_column($this->auditEntries('thread_entries', $this->text($comment, 'id')), 'action'),
        );

        $edit = $this->api('PATCH', '/thread-entries/' . $this->text($comment, 'id'), $this->assignee['token'], [
            'version' => 2,
            'body' => 'Ya no',
        ]);
        self::assertSame(404, $edit->getStatusCode());
    }

    public function testARetryWithTheSameIdAnswersWithTheStoredComment(): void
    {
        $id = '0192a1b2-0000-7000-8000-0000000000aa';
        $first = $this->api('POST', $this->threadPath, $this->owner['token'], ['id' => $id, 'body' => 'Una vez']);
        self::assertSame(201, $first->getStatusCode());

        $again = $this->api('POST', $this->threadPath, $this->owner['token'], ['id' => $id, 'body' => 'Una vez']);
        self::assertSame(200, $again->getStatusCode());
        self::assertSame($id, $this->json($again)['id']);
        $comments = $this->countRows('SELECT COUNT(*) FROM thread_entries WHERE kind = :kind', ['kind' => 'comment']);
        self::assertSame(1, $comments);

        $other = $this->api('POST', $this->threadPath, $this->owner['token'], ['id' => $id, 'body' => 'Distinto']);
        self::assertSame(409, $other->getStatusCode());
        $theirs = $this->api('POST', $this->threadPath, $this->assignee['token'], ['id' => $id, 'body' => 'Una vez']);
        self::assertSame(409, $theirs->getStatusCode());
    }

    public function testAPhotoAttachedToACommentIsSeenByWhoeverSeesTheTaskAndByNobodyElse(): void
    {
        $photo = $this->uploadPhoto($this->owner['token']);
        $comment = $this->api('POST', $this->threadPath, $this->owner['token'], [
            'body' => 'Mira la foto',
            'file_ids' => [$photo],
        ]);
        self::assertSame(201, $comment->getStatusCode(), (string) $comment->getBody());
        self::assertSame([$photo], $this->json($comment)['file_ids']);

        $content = '/files/' . $photo . '/content?size=thumbnail';
        // The assignee did not upload it and the `files` scope does not reach it; the task does.
        self::assertSame(200, $this->api('GET', $content, $this->assignee['token'])->getStatusCode());
        self::assertSame(200, $this->api('GET', '/files/' . $photo, $this->assignee['token'])->getStatusCode());
        self::assertSame(404, $this->api('GET', $content, $this->stranger['token'])->getStatusCode());

        // Seeing the photo does not let the reader deactivate it.
        $deactivate = $this->api('POST', '/files/' . $photo . '/deactivate', $this->assignee['token']);
        self::assertSame(404, $deactivate->getStatusCode());

        // Once the comment leaves the thread, so does the access.
        $entry = $this->text($this->json($comment), 'id');
        $this->api('POST', '/thread-entries/' . $entry . '/deactivate', $this->owner['token']);
        self::assertSame(404, $this->api('GET', $content, $this->assignee['token'])->getStatusCode());
    }

    public function testOnlyTheOwnPhotosAndAtMostFiveCanBeAttached(): void
    {
        $theirs = $this->uploadPhoto($this->assignee['token']);
        $foreign = $this->api('POST', $this->threadPath, $this->owner['token'], ['file_ids' => [$theirs]]);
        self::assertSame(['file_ids' => 'not_found'], $this->errorCodes($foreign));

        $photos = [];
        foreach (range(1, 6) as $unused) {
            $photos[] = $this->uploadPhoto($this->owner['token']);
        }
        $many = $this->api('POST', $this->threadPath, $this->owner['token'], ['file_ids' => $photos]);
        self::assertSame(['file_ids' => 'too_many'], $this->errorCodes($many));

        $five = array_slice($photos, 0, 5);
        $onlyPhotos = $this->api('POST', $this->threadPath, $this->owner['token'], ['file_ids' => $five]);
        self::assertSame(201, $onlyPhotos->getStatusCode());
        self::assertNull($this->json($onlyPhotos)['body']);
    }

    private function uploadPhoto(string $token): string
    {
        $image = imagecreatetruecolor(64, 48);
        imagefill($image, 0, 0, (int) imagecolorallocate($image, 11, 107, 176));
        ob_start();
        imagepng($image);
        $bytes = (string) ob_get_clean();
        $path = tempnam(sys_get_temp_dir(), 'upload');
        self::assertIsString($path);
        file_put_contents($path, $bytes);

        $request = (new ServerRequestFactory())->createServerRequest('POST', '/api/v1/files')
            ->withHeader('Content-Type', 'multipart/form-data; boundary=test')
            ->withHeader('Authorization', 'Bearer ' . $token)
            ->withParsedBody([])
            ->withUploadedFiles([
                'file' => new UploadedFile($path, 'foto.png', 'image/png', strlen($bytes), UPLOAD_ERR_OK),
            ]);
        $response = $this->app->handle($request);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return $this->text($this->json($response), 'id');
    }
}
