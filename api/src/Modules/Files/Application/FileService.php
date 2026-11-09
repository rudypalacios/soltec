<?php

declare(strict_types=1);

namespace Soltec\Modules\Files\Application;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Files\Domain\FileRecord;
use Soltec\Modules\Files\Domain\PhotoMetadata;
use Soltec\Modules\Files\Persistence\FileRepository;

/**
 * Photos. Whoever uploads a photo owns it, and the data scope of the resource decides whose photos a user reaches;
 * one outside the scope does not exist for them (404). Until a record adopts a photo (tasks and tickets, later
 * slices) nobody else needs to see it. Deactivating never deletes the files from the disk (nothing is deleted).
 */
final class FileService
{
    private const ENTITY = 'files';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly FileRepository $files,
        private readonly FileStorage $storage,
        private readonly AuditLogger $audit,
        private readonly FileAccessGrant $grant,
    ) {
    }

    /**
     * A photo is reached through the data scope of `files` (its uploader) or because a record the caller can see
     * carries it (ADR-0027).
     */
    public function get(CurrentUser $caller, string $id): FileRecord
    {
        $file = $this->files->find($id, $caller);
        if ($file === null && $this->grant->mayRead($caller, $id)) {
            $file = $this->files->findUnscoped($id);
        }

        return $file ?? throw ApiException::notFound();
    }

    /**
     * An active photo the caller reaches, to serve its content.
     *
     * @throws ApiException 404 when the photo is not in the caller's scope or is inactive
     */
    public function servable(CurrentUser $caller, string $id): FileRecord
    {
        $file = $this->get($caller, $id);

        return $file->isActive() ? $file : throw ApiException::notFound();
    }

    /**
     * The bytes of one size of a photo.
     *
     * @param string $size FileStorage::NORMAL or FileStorage::THUMBNAIL
     * @throws ApiException 404 when the file is gone from the disk
     */
    public function bytes(FileRecord $file, string $size): string
    {
        $path = $size === FileStorage::THUMBNAIL ? $file->thumbnailPath : $file->normalPath;

        return $this->storage->read($path) ?? throw ApiException::notFound();
    }

    /**
     * Stores a photo. `$id` is the one the client chose, so a retry (a lost answer, a phone that was offline) does
     * not duplicate it: the same id with the same photo from the same person answers with the photo already stored.
     *
     * @return array{file: FileRecord, created: bool}
     * @throws ValidationException field `file`: `too_large`, `unsupported_type` or `invalid`
     * @throws ApiException 409 `conflict` when the id belongs to another photo
     */
    public function upload(
        CurrentUser $caller,
        ActorContext $actor,
        ?string $id,
        string $originalName,
        string $bytes,
        PhotoMetadata $metadata,
    ): array {
        $photo = PhotoImage::process($bytes);
        $hash = sha1($photo['normal']);
        $id ??= Uuid::v7();

        if ($this->isRetry($caller, $id, $hash)) {
            return ['file' => $this->get($caller, $id), 'created' => false];
        }

        $paths = [];
        try {
            $paths[] = $normal = $this->storage->store($id, FileStorage::NORMAL, $photo['normal']);
            $paths[] = $thumbnail = $this->storage->store($id, FileStorage::THUMBNAIL, $photo['thumbnail']);
            $this->connection->transactional(function () use (
                $caller,
                $actor,
                $id,
                $originalName,
                $photo,
                $hash,
                $normal,
                $thumbnail,
                $metadata,
            ): void {
                $this->files->insert(
                    $id,
                    $caller->id,
                    $originalName,
                    $photo['width'],
                    $photo['height'],
                    strlen($photo['normal']),
                    $hash,
                    $normal,
                    $thumbnail,
                    $metadata,
                    $this->clock->now(),
                );
                $this->audit->record($actor, 'create', self::ENTITY, $id, null, [
                    'original_name' => $originalName,
                    'width' => $photo['width'],
                    'height' => $photo['height'],
                    'size_bytes' => strlen($photo['normal']),
                    'is_active' => true,
                ]);
            });
        } catch (UniqueConstraintViolationException) {
            // Two uploads of the same id at once: the one that lost is a retry when it carries the same photo.
            if ($this->isRetry($caller, $id, $hash)) {
                return ['file' => $this->get($caller, $id), 'created' => false];
            }
            throw ApiException::conflict();
        } catch (\Throwable $failure) {
            // The row never made it, so the files written for it are of no use to anyone.
            if ($this->files->identityOf($id) === null) {
                foreach ($paths as $path) {
                    $this->storage->delete($path);
                }
            }
            throw $failure;
        }

        return ['file' => $this->get($caller, $id), 'created' => true];
    }

    /** Idempotent. The files stay on the disk. */
    public function deactivate(CurrentUser $caller, ActorContext $actor, string $id): FileRecord
    {
        $this->connection->transactional(function () use ($caller, $actor, $id): void {
            // Only through the data scope: a record that shows the photo does not let its readers deactivate it.
            $file = $this->files->find($id, $caller) ?? throw ApiException::notFound();
            if (!$file->isActive() || !$this->files->lock($id)) {
                return;
            }

            $now = $this->clock->now();
            $this->files->setDeletedAt($id, $now, $now);
            $this->audit->record($actor, 'deactivate', self::ENTITY, $id, ['is_active' => true], [
                'is_active' => false,
            ]);
        });

        return $this->get($caller, $id);
    }

    /**
     * Whether `$id` already holds this same photo uploaded by this same person.
     *
     * @throws ApiException 409 `conflict` when the id belongs to a different photo or to someone else
     * @phpstan-impure it reads the database, which another request may change between two calls
     */
    private function isRetry(CurrentUser $caller, string $id, string $hash): bool
    {
        $existing = $this->files->identityOf($id);
        if ($existing === null) {
            return false;
        }
        if ($existing['uploaded_by'] !== $caller->id || $existing['content_hash'] !== $hash) {
            throw ApiException::conflict();
        }

        return true;
    }
}
