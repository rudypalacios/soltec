<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Persistence;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Query\QueryBuilder;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Auth\ScopedQuery;
use Soltec\Kernel\Db\Row;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Domain\AuditCursor;
use Soltec\Modules\Access\Domain\AuditFilter;

/**
 * Reads `audit_logs`, newest first. It is a read model: nothing here writes (that is `AuditLogger`, inside the
 * transaction of the change it records), and no route can edit or delete an entry. The scope of the reader is
 * applied by the actor of the entry, so `own` shows what the person did and `all` shows everything, including what
 * the system did and the moments an anonymous caller locked an account.
 */
final class AuditLogRepository
{
    private const RESOURCE = 'audit_logs';

    public function __construct(private readonly Connection $connection)
    {
    }

    /**
     * @return array{entries: list<array<string, mixed>>, next: AuditCursor|null}
     *     `next` is the cursor of the following page, or null when this was the last one
     */
    public function search(CurrentUser $reader, AuditFilter $filter, ?AuditCursor $after, int $limit): array
    {
        $query = $this->connection->createQueryBuilder()
            ->select(
                'LOWER(HEX(a.id)) AS id',
                'a.occurred_at',
                'LOWER(HEX(a.user_id)) AS user_id',
                'u.name AS user_name',
                'LOWER(HEX(a.device_id)) AS device_id',
                'a.action',
                'a.entity_type',
                'LOWER(HEX(a.entity_id)) AS entity_id',
                'a.before_data',
                'a.after_data',
                'INET6_NTOA(a.ip_address) AS ip_address',
            )
            ->from('audit_logs', 'a')
            ->leftJoin('a', 'users', 'u', 'u.id = a.user_id')
            ->orderBy('a.occurred_at', 'DESC')
            ->addOrderBy('a.id', 'DESC')
            // One more than asked: its existence says there is a next page without counting the table.
            ->setMaxResults($limit + 1);

        ScopedQuery::restrict($query, $reader, self::RESOURCE, 'a.user_id');
        $this->applyFilter($query, $filter);
        if ($after !== null) {
            $query->andWhere('(a.occurred_at < :after_at OR (a.occurred_at = :after_at AND a.id < UNHEX(:after_id)))')
                ->setParameter('after_at', Timestamps::toDb($after->occurredAt))
                ->setParameter('after_id', Uuid::toHex($after->id));
        }

        $rows = $query->executeQuery()->fetchAllAssociative();
        $hasMore = count($rows) > $limit;
        $rows = array_slice($rows, 0, $limit);

        $entries = array_map($this->present(...), $rows);
        $last = $rows === [] ? null : $rows[count($rows) - 1];
        $next = $hasMore && $last !== null
            ? new AuditCursor(Row::date($last, 'occurred_at'), Uuid::fromHex(Row::string($last, 'id')))
            : null;

        return ['entries' => $entries, 'next' => $next];
    }

    private function applyFilter(QueryBuilder $query, AuditFilter $filter): void
    {
        if ($filter->userId !== null) {
            $query->andWhere('a.user_id = UNHEX(:user_id)')->setParameter('user_id', Uuid::toHex($filter->userId));
        }
        if ($filter->entityType !== null) {
            $query->andWhere('a.entity_type = :entity_type')->setParameter('entity_type', $filter->entityType);
        }
        if ($filter->entityId !== null) {
            $query->andWhere('a.entity_id = UNHEX(:entity_id)')
                ->setParameter('entity_id', Uuid::toHex($filter->entityId));
        }
        if ($filter->action !== null) {
            $query->andWhere('a.action = :action')->setParameter('action', $filter->action);
        }
        if ($filter->from !== null) {
            $query->andWhere('a.occurred_at >= :from')->setParameter('from', Timestamps::toDb($filter->from));
        }
        if ($filter->to !== null) {
            $query->andWhere('a.occurred_at <= :to')->setParameter('to', Timestamps::toDb($filter->to));
        }
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed> the `AuditEntry` schema of the contract
     */
    private function present(array $row): array
    {
        $userId = Row::nullableString($row, 'user_id');
        $deviceId = Row::nullableString($row, 'device_id');
        $entityId = Row::nullableString($row, 'entity_id');

        return [
            'id' => Uuid::fromHex(Row::string($row, 'id')),
            'occurred_at' => Timestamps::toIso(Row::date($row, 'occurred_at')),
            'user' => $userId === null
                ? null
                : ['id' => Uuid::fromHex($userId), 'name' => Row::nullableString($row, 'user_name') ?? ''],
            'device_id' => $deviceId === null ? null : Uuid::fromHex($deviceId),
            'action' => Row::string($row, 'action'),
            'entity_type' => Row::string($row, 'entity_type'),
            'entity_id' => $entityId === null ? null : Uuid::fromHex($entityId),
            'before' => $this->decode(Row::nullableString($row, 'before_data')),
            'after' => $this->decode(Row::nullableString($row, 'after_data')),
            'ip_address' => Row::nullableString($row, 'ip_address'),
        ];
    }

    private function decode(?string $json): ?object
    {
        if ($json === null) {
            return null;
        }
        $decoded = json_decode($json, false, 512, JSON_THROW_ON_ERROR);

        return is_object($decoded) ? $decoded : null;
    }
}
