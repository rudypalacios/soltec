<?php

declare(strict_types=1);

namespace Soltec\Modules\Files\Http;

use JsonException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Message\UploadedFileInterface;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Http\CurrentUserAware;
use Soltec\Modules\Files\Application\FileService;
use Soltec\Modules\Files\Application\FileStorage;
use Soltec\Modules\Files\Application\PhotoImage;
use Soltec\Modules\Files\Domain\PhotoMetadata;

/** /v1/files */
final class FileController
{
    use CurrentUserAware;

    private const MAX_METADATA_BYTES = 8192;
    private const MAX_NAME_LENGTH = 190;
    private const DEFAULT_NAME = 'photo';

    public function __construct(private readonly FileService $files)
    {
    }

    /**
     * A multipart form with the photo in `file`, an optional `id` (a UUID the client chose, so a retry does not
     * duplicate the photo) and an optional `metadata` (a JSON object the client read from the EXIF).
     */
    public function upload(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::form($request);
        $id = $input->nullableUuid('id');
        $metadata = $this->metadata($input);
        $input->done();

        $upload = $request->getUploadedFiles()['file'] ?? null;
        if (!$upload instanceof UploadedFileInterface) {
            throw ValidationException::field('file', 'required');
        }
        $this->assertReceived($upload);
        $bytes = (string) $upload->getStream();

        $result = $this->files->upload(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $id,
            $this->name($upload->getClientFilename()),
            $bytes,
            $metadata,
        );

        return Json::write($response, $result['file']->toApi(), $result['created'] ? 201 : 200);
    }

    /** @param array<string, string> $args */
    public function show(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $file = $this->files->get($this->caller($request), $this->pathId($args, 'fileId'));

        return Json::write($response, $file->toApi());
    }

    /**
     * The image itself, in the size asked for. The browser revalidates by ETag on every use, so a user who loses
     * access (or a photo that is deactivated) stops getting it at once, and the unchanged photo costs a 304.
     *
     * @param array<string, string> $args
     */
    public function content(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $query = Input::query($request);
        $size = $query->choice('size', [FileStorage::NORMAL, FileStorage::THUMBNAIL], FileStorage::NORMAL);
        $query->done();

        $file = $this->files->servable($this->caller($request), $this->pathId($args, 'fileId'));
        $etag = sprintf('"%s-%s"', $file->contentHash, $size);
        $response = $response->withHeader('ETag', $etag)->withHeader('Cache-Control', 'private, no-cache');
        if ($request->getHeaderLine('If-None-Match') === $etag) {
            return $response->withStatus(304);
        }
        $response->getBody()->write($this->files->bytes($file, (string) $size));

        return $response->withHeader('Content-Type', 'image/webp');
    }

    /** @param array<string, string> $args */
    public function deactivate(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
    ): ResponseInterface {
        $file = $this->files->deactivate(
            $this->caller($request),
            ActorContext::fromRequest($request),
            $this->pathId($args, 'fileId'),
        );

        return Json::write($response, $file->toApi());
    }

    /** The metadata field is a JSON text inside the form; its own fields are checked like any other input. */
    private function metadata(Input $form): PhotoMetadata
    {
        $json = $form->nullableText('metadata', self::MAX_METADATA_BYTES);
        if ($json === null) {
            return PhotoMetadata::none();
        }
        try {
            $decoded = json_decode($json, true, 4, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            $form->fail('metadata', 'invalid');

            return PhotoMetadata::none();
        }
        if (!is_array($decoded) || ($decoded !== [] && array_is_list($decoded))) {
            $form->fail('metadata', 'invalid');

            return PhotoMetadata::none();
        }

        $nested = Input::nested('metadata', $decoded);
        $metadata = PhotoMetadata::read($nested);
        $form->absorb($nested);

        return $metadata;
    }

    /** @throws ValidationException when PHP or the form did not deliver the whole file */
    private function assertReceived(UploadedFileInterface $upload): void
    {
        $error = $upload->getError();
        if ($error === UPLOAD_ERR_OK) {
            // Look at the size before reading, so an oversized upload is not loaded into memory.
            if (($upload->getSize() ?? 0) > PhotoImage::MAX_BYTES) {
                throw ValidationException::field('file', 'too_large');
            }

            return;
        }

        throw ValidationException::field('file', match ($error) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'too_large',
            UPLOAD_ERR_NO_FILE => 'required',
            default => 'invalid',
        });
    }

    /** The name the client gave, kept only to show it: no path, no control characters, a bounded length. */
    private function name(?string $clientName): string
    {
        $leaf = basename(str_replace('\\', '/', (string) $clientName));
        $name = mb_substr(trim((string) preg_replace('/[\x00-\x1F\x7F]/u', '', $leaf)), 0, self::MAX_NAME_LENGTH);

        return $name === '' ? self::DEFAULT_NAME : $name;
    }
}
