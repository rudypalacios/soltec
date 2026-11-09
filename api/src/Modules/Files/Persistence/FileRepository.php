<?php

declare(strict_types=1);

namespace Soltec\Modules\Files\Persistence;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Query\QueryBuilder;
use JsonException;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Auth\ScopedQuery;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Files\Domain\FileRecord;
use Soltec\Modules\Files\Domain\PhotoMetadata;

/**
 * Reads and writes `files`. Every read takes the reader and applies the data scope of the resource (the owner of a
 * file is whoever uploaded it), so a file outside the scope does not exist for them. Ids cross the database as hex
 * (see Uuid).
 */
final class FileRepository
{
    public const RESOURCE = 'files';

    private const COLUMNS = 'LOWER(HEX(f.id)) AS id, LOWER(HEX(f.uploaded_by)) AS uploaded_by, '
        . 'u.name AS uploader_name, f.original_name, f.width, f.height, f.size_bytes, f.content_hash, '
        . 'f.normal_path, f.thumbnail_path, f.metadata, f.created_at, f.updated_at, f.version, f.deleted_at';

    public function __construct(private readonly Connection $connection)
    {
    }

    public function find(string $id, CurrentUser $reader): ?FileRecord
    {
        $row = $this->base($reader)
            ->andWhere('f.id = UNHEX(:id)')
            ->setParameter('id', Uuid::toHex($id))
            ->executeQuery()
            ->fetchAssociative();

        return $row === false ? null : $this->hydrate($row);
    }

    /**
     * Who uploaded the file with this id and its content hash, whoever asks: the upload of an id that exists must
     * tell a retry of the same photo from a clash with someone else's.
     *
     * @return array{uploaded_by: string, content_hash: string}|null
     */
    public function identityOf(string $id): ?array
    {
        $row = $this->connection->fetchAssociative(
            'SELECT LOWER(HEX(uploaded_by)) AS uploaded_by, content_hash FROM files WHERE id = UNHEX(:id)',
            ['id' => Uuid::toHex($id)],
        );

        if ($row === false) {
            return null;
        }

        return [
            'uploaded_by' => Uuid::fromHex(Row::string($row, 'uploaded_by')),
            'content_hash' => Row::string($row, 'content_hash'),
        ];
    }

    /** Locks the row until the end of the transaction. */
    public function lock(string $id): bool
    {
        return $this->connection->fetchOne(
            'SELECT 1 FROM files WHERE id = UNHEX(:id) FOR UPDATE',
            ['id' => Uuid::toHex($id)],
        ) !== false;
    }

    public function insert(
        string $id,
        string $uploadedBy,
        string $originalName,
        int $width,
        int $height,
        int $sizeBytes,
        string $contentHash,
        string $normalPath,
        string $thumbnailPath,
        PhotoMetadata $metadata,
        DateTimeImmutable $now,
    ): void {
        $this->connection->executeStatement(
            'INSERT INTO files (id, uploaded_by, original_name, width, height, size_bytes, content_hash, '
            . 'normal_path, thumbnail_path, metadata, created_at, updated_at) VALUES (UNHEX(:id), UNHEX(:uploaded_by), '
            . ':original_name, :width, :height, :size_bytes, :content_hash, :normal_path, :thumbnail_path, :metadata, '
            . ':now, :now)',
            [
                'id' => Uuid::toHex($id),
                'uploaded_by' => Uuid::toHex($uploadedBy),
                'original_name' => $originalName,
                'width' => $width,
                'height' => $height,
                'size_bytes' => $sizeBytes,
                'content_hash' => $contentHash,
                'normal_path' => $normalPath,
                'thumbnail_path' => $thumbnailPath,
                'metadata' => $metadata->isEmpty() ? null : json_encode($metadata->toArray(), JSON_THROW_ON_ERROR),
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    /** Deactivates (a date) or reactivates (null). */
    public function setDeletedAt(string $id, ?DateTimeImmutable $deletedAt, DateTimeImmutable $now): void
    {
        $this->connection->executeStatement(
            'UPDATE files SET deleted_at = :deleted_at, updated_at = :now, version = version + 1 '
            . 'WHERE id = UNHEX(:id)',
            [
                'id' => Uuid::toHex($id),
                'deleted_at' => $deletedAt === null ? null : Timestamps::toDb($deletedAt),
                'now' => Timestamps::toDb($now),
            ],
        );
    }

    private function base(CurrentUser $reader): QueryBuilder
    {
        $query = $this->connection->createQueryBuilder()
            ->select(self::COLUMNS)
            ->from('files', 'f')
            ->innerJoin('f', 'users', 'u', 'u.id = f.uploaded_by');
        ScopedQuery::restrict($query, $reader, self::RESOURCE, 'f.uploaded_by');

        return $query;
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): FileRecord
    {
        return new FileRecord(
            Uuid::fromHex(Row::string($row, 'id')),
            Uuid::fromHex(Row::string($row, 'uploaded_by')),
            Row::string($row, 'uploader_name'),
            Row::string($row, 'original_name'),
            Row::int($row, 'width'),
            Row::int($row, 'height'),
            Row::int($row, 'size_bytes'),
            Row::string($row, 'content_hash'),
            Row::string($row, 'normal_path'),
            Row::string($row, 'thumbnail_path'),
            PhotoMetadata::fromStored($this->decode(Row::nullableString($row, 'metadata'))),
            Row::date($row, 'created_at'),
            Row::date($row, 'updated_at'),
            Row::int($row, 'version'),
            Row::nullableDate($row, 'deleted_at'),
        );
    }

    /** @return array<array-key, mixed>|null */
    private function decode(?string $json): ?array
    {
        if ($json === null) {
            return null;
        }
        try {
            $decoded = json_decode($json, true, 8, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            // A damaged column must not take the file down with it: the photo is still there without its metadata.
            return null;
        }

        return is_array($decoded) ? $decoded : null;
    }
}
