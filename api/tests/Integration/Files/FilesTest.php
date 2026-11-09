<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Files;

use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\UploadedFile;
use Soltec\Kernel\Paths;
use Soltec\Modules\Files\Application\FileStorage;
use Soltec\Modules\Files\Persistence\LocalFileStorage;
use Soltec\Tests\Integration\Access\AccessTestCase;

final class FilesTest extends AccessTestCase
{
    private string $storageRoot = '';
    private string $adminToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminToken = $this->tokenFor($this->createAdmin()['id']);
    }

    protected function tearDown(): void
    {
        if ($this->storageRoot !== '') {
            $this->removeDirectory($this->storageRoot);
        }
        parent::tearDown();
    }

    /** @return array<string, mixed> */
    protected function containerDefinitions(): array
    {
        $this->storageRoot = sys_get_temp_dir() . '/soltec-test-' . bin2hex(random_bytes(6));
        mkdir($this->storageRoot, 0700, true);

        return parent::containerDefinitions() + [
            FileStorage::class => new LocalFileStorage(new Paths($this->storageRoot)),
        ];
    }

    public function testStoresAPhotoAsANormalImageAndAThumbnail(): void
    {
        $response = $this->upload($this->adminToken, $this->image(3200, 2400, 'jpeg'), name: 'visita.jpg');

        self::assertSame(201, $response->getStatusCode());
        $file = $this->json($response);
        self::assertSame('visita.jpg', $file['original_name']);
        self::assertSame(1600, $file['width']);
        self::assertSame(1200, $file['height']);
        self::assertNull($file['metadata']);
        self::assertTrue($file['is_active']);
        self::assertSame(1, $file['version']);
        self::assertSame('Admin', $this->valueAt($file, 'uploaded_by', 'name'));
        self::assertSame(
            [$this->text($file, 'id') . '-normal.webp', $this->text($file, 'id') . '-thumbnail.webp'],
            $this->storedFiles(),
        );

        $normal = $this->content($this->text($file, 'id'), 'normal');
        $thumbnail = $this->content($this->text($file, 'id'), 'thumbnail');
        self::assertSame([1600, 1200], $this->webpSize((string) $normal->getBody()));
        self::assertSame([320, 240], $this->webpSize((string) $thumbnail->getBody()));
        self::assertSame($file['size_bytes'], strlen((string) $normal->getBody()));

        $audit = $this->auditEntries('files', $this->text($file, 'id'));
        self::assertCount(1, $audit);
        self::assertSame('create', $audit[0]['action']);
    }

    public function testNeverScalesAPhotoUp(): void
    {
        $file = $this->json($this->upload($this->adminToken, $this->image(300, 200, 'png')));

        self::assertSame([300, 200], [$file['width'], $file['height']]);
    }

    public function testKeepsOnlyTheMetadataItKnows(): void
    {
        $metadata = json_encode([
            'taken_at' => '2026-10-30T14:05:09.000Z',
            'latitude' => 14.6349149,
            'longitude' => -90.5068824,
            'device_make' => 'Google',
            'device_model' => 'Pixel 7',
            'gps_secret' => 'ignored',
        ], JSON_THROW_ON_ERROR);

        $file = $this->json($this->upload($this->adminToken, $this->image(40, 40, 'png'), ['metadata' => $metadata]));

        self::assertEquals([
            'taken_at' => '2026-10-30T14:05:09.000Z',
            'latitude' => 14.634915,
            'longitude' => -90.506882,
            'device_make' => 'Google',
            'device_model' => 'Pixel 7',
        ], $file['metadata']);
        $stored = $this->json($this->get('/files/' . $this->text($file, 'id'), $this->adminToken));
        self::assertEquals($file['metadata'], $stored['metadata']);
    }

    public function testRefusesWrongMetadata(): void
    {
        $png = $this->image(40, 40, 'png');
        $cases = [
            'not json' => ['{', ['metadata' => 'invalid']],
            'a list' => ['[1]', ['metadata' => 'invalid']],
            'latitude alone' => ['{"latitude":1.5}', ['metadata.longitude' => 'required']],
            'out of range' => ['{"latitude":91,"longitude":0}', ['metadata.latitude' => 'out_of_range']],
            'a string for a number' => ['{"latitude":"14.6","longitude":0}', ['metadata.latitude' => 'invalid']],
            'a bad date' => ['{"taken_at":"yesterday"}', ['metadata.taken_at' => 'invalid']],
            'a long name' => [
                '{"device_make":"' . str_repeat('a', 101) . '"}',
                ['metadata.device_make' => 'too_long'],
            ],
            'too big' => ['{"device_make":"' . str_repeat('a', 8200) . '"}', ['metadata' => 'too_long']],
        ];

        foreach ($cases as $name => [$json, $errors]) {
            $response = $this->upload($this->adminToken, $png, ['metadata' => $json]);
            self::assertSame(422, $response->getStatusCode(), $name);
            self::assertSame($errors, $this->errorCodes($response), $name);
        }
        self::assertSame([], $this->storedFiles());
    }

    public function testRefusesWhatIsNotAPhoto(): void
    {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
        $cases = [
            'no file' => [null, ['file' => 'required']],
            'an svg' => [$svg, ['file' => 'unsupported_type']],
            'a gif' => ["GIF89a\x01\x00\x01\x00\x00\x00\x00;", ['file' => 'unsupported_type']],
            'a broken png' => [substr($this->image(50, 50, 'png'), 0, 60), ['file' => 'invalid']],
            'too many bytes' => [str_repeat('a', 10_485_761), ['file' => 'too_large']],
        ];

        foreach ($cases as $name => [$bytes, $errors]) {
            $response = $this->upload($this->adminToken, $bytes);
            self::assertSame(422, $response->getStatusCode(), $name);
            self::assertSame($errors, $this->errorCodes($response), $name);
        }
        self::assertSame([], $this->storedFiles());
        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM files'));
    }

    public function testReportsAnUploadPhpDidNotDeliver(): void
    {
        $tooBig = $this->uploadFile(UPLOAD_ERR_INI_SIZE);
        self::assertSame(['file' => 'too_large'], $this->errorCodes($tooBig));

        $partial = $this->uploadFile(UPLOAD_ERR_PARTIAL);
        self::assertSame(['file' => 'invalid'], $this->errorCodes($partial));
    }

    public function testKeepsOnlyTheLastPartOfTheClientName(): void
    {
        $cases = [
            '../../etc/passwd' => 'passwd',
            'C:\\fotos\\visita 1.png' => 'visita 1.png',
            "tab\there\x00.png" => 'tabhere.png',
            '   ' => 'photo',
            str_repeat('ñ', 300) . '.png' => str_repeat('ñ', 190),
        ];

        foreach ($cases as $sent => $expected) {
            $file = $this->json($this->upload($this->adminToken, $this->image(20, 20, 'png'), name: (string) $sent));
            self::assertSame($expected, $file['original_name']);
        }
    }

    public function testARetryWithTheSameIdAnswersWithThePhotoAlreadyStored(): void
    {
        $id = '0192f1c2-7d3a-7a11-8f2e-00000000f001';
        $png = $this->image(60, 40, 'png');

        $first = $this->upload($this->adminToken, $png, ['id' => $id]);
        $again = $this->upload($this->adminToken, $png, ['id' => $id]);

        self::assertSame(201, $first->getStatusCode());
        self::assertSame($id, $this->json($first)['id']);
        self::assertSame(200, $again->getStatusCode());
        self::assertSame($id, $this->json($again)['id']);
        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM files'));
        self::assertCount(1, $this->auditEntries('files', $id));
    }

    public function testAnIdThatBelongsToAnotherPhotoOrAnotherPersonIsAConflict(): void
    {
        $id = '0192f1c2-7d3a-7a11-8f2e-00000000f002';
        $this->upload($this->adminToken, $this->image(60, 40, 'png'), ['id' => $id]);

        $otherPhoto = $this->upload($this->adminToken, $this->image(70, 50, 'png'), ['id' => $id]);
        self::assertSame(409, $otherPhoto->getStatusCode());

        $someone = $this->tokenWith('files', 'view', 'create');
        $otherPerson = $this->upload($someone, $this->image(60, 40, 'png'), ['id' => $id]);
        self::assertSame(409, $otherPerson->getStatusCode());
        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM files'));
    }

    public function testRefusesAnIdThatIsNotAUuid(): void
    {
        $response = $this->upload($this->adminToken, $this->image(20, 20, 'png'), ['id' => 'not-a-uuid']);

        self::assertSame(['id' => 'invalid'], $this->errorCodes($response));
    }

    public function testServesTheImageWithAnETagAndAnswers304WhenItIsUnchanged(): void
    {
        $file = $this->json($this->upload($this->adminToken, $this->image(500, 400, 'png')));
        $id = $this->text($file, 'id');

        $first = $this->content($id, 'normal');
        self::assertSame(200, $first->getStatusCode());
        self::assertSame('image/webp', $first->getHeaderLine('Content-Type'));
        self::assertSame('private, no-cache', $first->getHeaderLine('Cache-Control'));
        $etag = $first->getHeaderLine('ETag');
        self::assertNotSame('', $etag);

        $again = $this->content($id, 'normal', ['If-None-Match' => $etag]);
        self::assertSame(304, $again->getStatusCode());
        self::assertSame('', (string) $again->getBody());

        // The thumbnail is another picture, so it has another tag.
        self::assertNotSame($etag, $this->content($id, 'thumbnail')->getHeaderLine('ETag'));
        self::assertSame(['size' => 'invalid'], $this->errorCodes($this->get(
            '/files/' . $id . '/content?size=huge',
            $this->adminToken,
        )));
    }

    public function testAUserReachesOnlyTheirOwnPhotosWithTheOwnScope(): void
    {
        $roleId = $this->createRole('Fotógrafo', ['files' => ['view', 'create', 'deactivate']], ['files' => 'own']);
        $ana = $this->tokenFor($this->createUser('ana@example.com', [$roleId])['id']);
        $luis = $this->tokenFor($this->createUser('luis@example.com', [$roleId])['id']);
        $anas = $this->text($this->json($this->upload($ana, $this->image(40, 40, 'png'))), 'id');

        self::assertSame(200, $this->get('/files/' . $anas, $ana)->getStatusCode());
        self::assertSame(200, $this->content($anas, 'thumbnail', [], $ana)->getStatusCode());

        // For anyone else it does not exist, and nothing says otherwise.
        self::assertSame(404, $this->get('/files/' . $anas, $luis)->getStatusCode());
        self::assertSame(404, $this->content($anas, 'normal', [], $luis)->getStatusCode());
        self::assertSame(404, $this->post('/files/' . $anas . '/deactivate', $luis)->getStatusCode());

        // The scope `all` reaches everyone's photos.
        self::assertSame(200, $this->get('/files/' . $anas, $this->adminToken)->getStatusCode());
    }

    public function testDeactivatingStopsServingThePhotoButKeepsItsFiles(): void
    {
        $file = $this->json($this->upload($this->adminToken, $this->image(40, 40, 'png')));
        $id = $this->text($file, 'id');

        $response = $this->post('/files/' . $id . '/deactivate', $this->adminToken);

        self::assertSame(200, $response->getStatusCode());
        self::assertFalse($this->json($response)['is_active']);
        self::assertSame(404, $this->content($id, 'normal')->getStatusCode());
        self::assertSame(404, $this->content($id, 'thumbnail')->getStatusCode());
        self::assertFalse($this->json($this->get('/files/' . $id, $this->adminToken))['is_active']);
        self::assertCount(2, $this->storedFiles());

        // Idempotent: the second call changes and audits nothing.
        $this->post('/files/' . $id . '/deactivate', $this->adminToken);
        self::assertSame(['create', 'deactivate'], array_column($this->auditEntries('files', $id), 'action'));
    }

    public function testEachActionNeedsItsOwnPermission(): void
    {
        $file = $this->json($this->upload($this->adminToken, $this->image(40, 40, 'png')));
        $id = $this->text($file, 'id');
        $viewer = $this->tokenWith('files', 'view');
        $uploader = $this->tokenWith('files', 'view', 'create');
        $nobody = $this->tokenWith('departments', 'view');

        self::assertSame(200, $this->get('/files/' . $id, $viewer)->getStatusCode());
        self::assertSame(200, $this->content($id, 'normal', [], $viewer)->getStatusCode());
        self::assertSame(403, $this->upload($viewer, $this->image(20, 20, 'png'))->getStatusCode());
        self::assertSame(403, $this->post('/files/' . $id . '/deactivate', $viewer)->getStatusCode());

        self::assertSame(201, $this->upload($uploader, $this->image(20, 20, 'png'))->getStatusCode());
        self::assertSame(403, $this->post('/files/' . $id . '/deactivate', $uploader)->getStatusCode());

        self::assertSame(403, $this->get('/files/' . $id, $nobody)->getStatusCode());
        self::assertSame(403, $this->upload($nobody, $this->image(20, 20, 'png'))->getStatusCode());
        self::assertSame(401, $this->upload(null, $this->image(20, 20, 'png'))->getStatusCode());
    }

    public function testAnUnknownPhotoIsNotFound(): void
    {
        $unknown = '0192f1c2-7d3a-7a11-8f2e-00000000f0ff';

        self::assertSame(404, $this->get('/files/' . $unknown, $this->adminToken)->getStatusCode());
        self::assertSame(404, $this->get('/files/not-a-uuid/content', $this->adminToken)->getStatusCode());
    }

    public function testThePhotoIsNotKeptWhenItsRecordCannotBeSaved(): void
    {
        // A foreign key that fails: the files written first must not stay behind.
        $this->connection->executeStatement('SET FOREIGN_KEY_CHECKS = 1');
        $token = $this->tokenWith('files', 'view', 'create');
        $this->connection->executeStatement(
            'ALTER TABLE files DROP FOREIGN KEY fk_files_uploaded_by',
        );
        $this->connection->executeStatement('ALTER TABLE files ADD COLUMN extra INT NOT NULL');

        try {
            $response = $this->upload($token, $this->image(20, 20, 'png'));
            self::assertSame(500, $response->getStatusCode());
            self::assertSame([], $this->storedFiles());
        } finally {
            $this->connection->executeStatement('ALTER TABLE files DROP COLUMN extra');
            $this->connection->executeStatement(
                'ALTER TABLE files ADD CONSTRAINT fk_files_uploaded_by FOREIGN KEY (uploaded_by) '
                . 'REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT',
            );
        }
    }

    public function testTheMigrationCanBeRepeatedWithoutDuplicatingAnything(): void
    {
        $this->applyMigrationAgain('20261109000001');

        self::assertSame(self::SEEDED_PERMISSION_ROWS, $this->countRows('SELECT COUNT(*) FROM role_permissions'));
        self::assertSame(1, $this->countRows("SELECT COUNT(*) FROM resources WHERE code = 'files' AND scoped = 1"));
    }

    /**
     * A multipart upload as PHP delivers it: the photo among the uploaded files, the text fields as the parsed body.
     *
     * @param array<string, string> $fields
     */
    private function upload(
        ?string $token,
        ?string $bytes,
        array $fields = [],
        string $name = 'photo.png',
    ): ResponseInterface {
        $request = (new ServerRequestFactory())->createServerRequest('POST', '/api/v1/files')
            ->withHeader('Content-Type', 'multipart/form-data; boundary=test')
            ->withParsedBody($fields);
        if ($token !== null) {
            $request = $request->withHeader('Authorization', 'Bearer ' . $token);
        }
        if ($bytes !== null) {
            $path = tempnam(sys_get_temp_dir(), 'upload');
            self::assertIsString($path);
            file_put_contents($path, $bytes);
            $request = $request->withUploadedFiles([
                'file' => new UploadedFile($path, $name, 'image/png', strlen($bytes), UPLOAD_ERR_OK),
            ]);
        }

        return $this->app->handle($request);
    }

    /** An upload that PHP itself refused or cut short. */
    private function uploadFile(int $error): ResponseInterface
    {
        $path = tempnam(sys_get_temp_dir(), 'upload');
        self::assertIsString($path);
        $request = (new ServerRequestFactory())->createServerRequest('POST', '/api/v1/files')
            ->withHeader('Content-Type', 'multipart/form-data; boundary=test')
            ->withHeader('Authorization', 'Bearer ' . $this->adminToken)
            ->withParsedBody([])
            ->withUploadedFiles(['file' => new UploadedFile($path, 'big.jpg', 'image/jpeg', 0, $error)]);

        return $this->app->handle($request);
    }

    /** @param array<string, string> $headers */
    private function get(string $path, ?string $token, array $headers = []): ResponseInterface
    {
        return $this->call('GET', '/api/v1' . $path, $this->withToken($headers, $token));
    }

    private function post(string $path, ?string $token): ResponseInterface
    {
        return $this->call('POST', '/api/v1' . $path, $this->withToken([], $token));
    }

    /** @param array<string, string> $headers */
    private function content(string $id, string $size, array $headers = [], ?string $token = null): ResponseInterface
    {
        return $this->get('/files/' . $id . '/content?size=' . $size, $token ?? $this->adminToken, $headers);
    }

    /**
     * @param array<string, string> $headers
     * @return array<string, string>
     */
    private function withToken(array $headers, ?string $token): array
    {
        return $token === null ? $headers : $headers + ['Authorization' => 'Bearer ' . $token];
    }

    /** A real picture of the given size and type, with some detail so it does not compress to nothing. */
    private function image(int $width, int $height, string $type): string
    {
        $image = imagecreatetruecolor(max(1, $width), max(1, $height));
        imagefill($image, 0, 0, (int) imagecolorallocate($image, 11, 107, 176));
        $centerX = intdiv($width, 2);
        $centerY = intdiv($height, 2);
        imagefilledellipse($image, $centerX, $centerY, $centerX, $centerY, 0xFFFFFF);
        ob_start();
        $type === 'jpeg' ? imagejpeg($image) : imagepng($image);

        return (string) ob_get_clean();
    }

    /** @return array{int, int} */
    private function webpSize(string $bytes): array
    {
        $size = getimagesizefromstring($bytes);
        self::assertIsArray($size);
        self::assertSame(IMAGETYPE_WEBP, $size[2]);

        return [$size[0], $size[1]];
    }

    /** @return list<string> the files under storage/files, without their folders */
    private function storedFiles(): array
    {
        $files = glob($this->storageRoot . '/storage/files/*/*') ?: [];
        $names = array_map('basename', $files);
        sort($names);

        return $names;
    }

    private function removeDirectory(string $directory): void
    {
        foreach (glob($directory . '/{,.}*', GLOB_BRACE) ?: [] as $entry) {
            if (in_array(basename($entry), ['.', '..'], true)) {
                continue;
            }
            is_dir($entry) ? $this->removeDirectory($entry) : unlink($entry);
        }
        rmdir($directory);
    }
}
