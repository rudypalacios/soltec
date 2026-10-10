<?php

declare(strict_types=1);

namespace Soltec\Modules\Organization\Application;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Organization\Domain\DepartmentRecord;
use Soltec\Modules\Organization\Persistence\DepartmentRepository;

/**
 * Administration of departments. Departments have no data scope of their own: whoever may view them sees all of
 * them. A department with active users cannot be deactivated, and the error says how many there are.
 */
final class DepartmentService
{
    private const ENTITY = 'departments';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly DepartmentRepository $departments,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return array{records: list<DepartmentRecord>, total: int} */
    public function list(?string $text, string $status, Pagination $page): array
    {
        return $this->departments->search($text, $status, $page);
    }

    public function get(string $id): DepartmentRecord
    {
        return $this->departments->find($id) ?? throw ApiException::notFound();
    }

    public function create(ActorContext $actor, string $name): DepartmentRecord
    {
        $id = Uuid::v7();
        try {
            $this->connection->transactional(function () use ($actor, $id, $name): void {
                $this->departments->insert($id, $name, $this->clock->now());
                $this->audit->record($actor, 'create', self::ENTITY, $id, null, ['name' => $name, 'is_active' => true]);
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('name', 'taken');
        }

        return $this->get($id);
    }

    /** @throws ApiException 404 or 409 `conflict` (stale version) */
    public function rename(ActorContext $actor, string $id, int $version, string $name): DepartmentRecord
    {
        try {
            $this->connection->transactional(function () use ($actor, $id, $version, $name): void {
                $department = $this->departments->find($id) ?? throw ApiException::notFound();
                if (!$this->departments->rename($id, $version, $name, $this->clock->now())) {
                    throw ApiException::conflict();
                }
                if ($department->name !== $name) {
                    $this->audit->record($actor, 'update', self::ENTITY, $id, ['name' => $department->name], [
                        'name' => $name,
                    ]);
                }
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('name', 'taken');
        }

        return $this->get($id);
    }

    /**
     * Idempotent. Refused while the department has active users: they must be moved first.
     *
     * @throws ApiException 404, or 409 `department_in_use` with `active_user_count`
     */
    public function deactivate(ActorContext $actor, string $id): DepartmentRecord
    {
        $this->connection->transactional(function () use ($actor, $id): void {
            if (!$this->departments->lock($id)) {
                throw ApiException::notFound();
            }
            $department = $this->get($id);
            if (!$department->isActive()) {
                return;
            }
            if ($department->activeUserCount > 0) {
                throw ApiException::conflict(
                    'department_in_use',
                    sprintf('The department still has %d active users.', $department->activeUserCount),
                    ['active_user_count' => $department->activeUserCount],
                );
            }

            $now = $this->clock->now();
            $this->departments->setDeletedAt($id, $now, $now);
            $this->audit->record($actor, 'deactivate', self::ENTITY, $id, ['is_active' => true], [
                'is_active' => false,
            ]);
        });

        return $this->get($id);
    }

    /** Idempotent. Fails when an active department already has the same name. */
    public function reactivate(ActorContext $actor, string $id): DepartmentRecord
    {
        try {
            $this->connection->transactional(function () use ($actor, $id): void {
                $department = $this->get($id);
                if ($department->isActive()) {
                    return;
                }

                $this->departments->setDeletedAt($id, null, $this->clock->now());
                $this->audit->record($actor, 'reactivate', self::ENTITY, $id, ['is_active' => false], [
                    'is_active' => true,
                ]);
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('name', 'taken');
        }

        return $this->get($id);
    }
}
