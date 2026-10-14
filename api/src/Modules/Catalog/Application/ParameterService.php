<?php

declare(strict_types=1);

namespace Soltec\Modules\Catalog\Application;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\Pagination;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Catalog\Domain\ParameterDefinition;
use Soltec\Modules\Catalog\Domain\ParameterRecord;
use Soltec\Modules\Catalog\Persistence\ParameterRepository;

/**
 * Administration of the catalog lists. They have no data scope: whoever may view one sees all its values. A deactivated
 * value drags nothing along (ADR-0023) and is refused only when it is the parent of active values (an area with active
 * groups): those must be deactivated or moved first. A value cannot be reactivated under an inactive parent.
 */
final class ParameterService
{
    /** The most a form shows in a selector; the lists are in the tens. */
    private const OPTIONS_LIMIT = 500;

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly ParameterRepository $parameters,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return array{records: list<ParameterRecord>, total: int} */
    public function list(
        ParameterDefinition $parameter,
        ?string $text,
        string $status,
        ?string $parentId,
        Pagination $page,
    ): array {
        return $this->parameters->search($parameter, $text, $status, $parentId, $page);
    }

    /** @return list<array<string, string>> */
    public function options(ParameterDefinition $parameter): array
    {
        return $this->parameters->options($parameter, self::OPTIONS_LIMIT);
    }

    public function get(ParameterDefinition $parameter, string $id): ParameterRecord
    {
        return $this->parameters->find($parameter, $id) ?? throw ApiException::notFound();
    }

    /** @throws ValidationException 422 `taken` (name), `not_found` (parent missing or inactive) */
    public function create(
        ActorContext $actor,
        ParameterDefinition $parameter,
        string $name,
        ?string $color,
        ?string $parentId,
    ): ParameterRecord {
        $id = Uuid::v7();
        try {
            $this->connection->transactional(function () use ($actor, $parameter, $id, $name, $color, $parentId): void {
                $this->requireUsableParent($parameter, $parentId);
                $this->parameters->insert($parameter, $id, $name, $color, $parentId, $this->clock->now());
                $this->audit->record(
                    $actor,
                    'create',
                    $parameter->table,
                    $id,
                    null,
                    $this->snapshot($parameter, $name, $color, $parentId) + ['is_active' => true],
                );
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('name', 'taken');
        }

        return $this->get($parameter, $id);
    }

    /**
     * A value may keep a parent that was deactivated since (ADR-0023); only a new parent has to be active.
     *
     * @throws ApiException 404 or 409 `conflict` (stale version)
     */
    public function update(
        ActorContext $actor,
        ParameterDefinition $parameter,
        string $id,
        int $version,
        string $name,
        ?string $color,
        ?string $parentId,
    ): ParameterRecord {
        try {
            $this->connection->transactional(
                function () use ($actor, $parameter, $id, $version, $name, $color, $parentId): void {
                    $current = $this->parameters->find($parameter, $id) ?? throw ApiException::notFound();
                    if ($parentId !== $current->parentId) {
                        $this->requireUsableParent($parameter, $parentId);
                    }
                    $now = $this->clock->now();
                    if (!$this->parameters->update($parameter, $id, $version, $name, $color, $parentId, $now)) {
                        throw ApiException::conflict();
                    }
                    $before = $this->snapshot($parameter, $current->name, $current->color, $current->parentId);
                    $after = $this->snapshot($parameter, $name, $color, $parentId);
                    if ($before !== $after) {
                        $this->audit->record($actor, 'update', $parameter->table, $id, $before, $after);
                    }
                },
            );
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('name', 'taken');
        }

        return $this->get($parameter, $id);
    }

    /**
     * Idempotent. Refused while active values of another list point at this one.
     *
     * @throws ApiException 404, or 409 with the list's own code (`area_in_use`…) and the count of active values
     */
    public function deactivate(ActorContext $actor, ParameterDefinition $parameter, string $id): ParameterRecord
    {
        $this->connection->transactional(function () use ($actor, $parameter, $id): void {
            if (!$this->parameters->lock($parameter, $id)) {
                throw ApiException::notFound();
            }
            $record = $this->get($parameter, $id);
            if (!$record->isActive()) {
                return;
            }
            $children = $parameter->children;
            $count = $children === null ? 0 : $record->extra[$children->countField];
            if ($children !== null && is_int($count) && $count > 0) {
                throw ApiException::conflict(
                    $children->errorCode,
                    sprintf('The value still has %d active values under it.', $count),
                    [$children->countField => $count],
                );
            }

            $now = $this->clock->now();
            $this->parameters->setDeletedAt($parameter, $id, $now, $now);
            $this->audit->record($actor, 'deactivate', $parameter->table, $id, ['is_active' => true], [
                'is_active' => false,
            ]);
        });

        return $this->get($parameter, $id);
    }

    /**
     * Idempotent. Fails when an active value already has the same name (422 `taken`) or when the parent is inactive
     * (422 `parent_inactive` on the parent's field).
     */
    public function reactivate(ActorContext $actor, ParameterDefinition $parameter, string $id): ParameterRecord
    {
        try {
            $this->connection->transactional(function () use ($actor, $parameter, $id): void {
                if (!$this->parameters->lock($parameter, $id)) {
                    throw ApiException::notFound();
                }
                $record = $this->get($parameter, $id);
                if ($record->isActive()) {
                    return;
                }
                $parentColumn = $parameter->parent?->column;
                $parentActive = $record->parentId === null
                    || $this->parameters->lockParent($parameter, $record->parentId) === true;
                if ($parentColumn !== null && !$parentActive) {
                    throw ValidationException::field($parentColumn, 'parent_inactive');
                }

                $this->parameters->setDeletedAt($parameter, $id, null, $this->clock->now());
                $this->audit->record($actor, 'reactivate', $parameter->table, $id, ['is_active' => false], [
                    'is_active' => true,
                ]);
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('name', 'taken');
        }

        return $this->get($parameter, $id);
    }

    /** Locks the parent shared and requires it to exist and be active; a list without a parent needs nothing. */
    private function requireUsableParent(ParameterDefinition $parameter, ?string $parentId): void
    {
        if ($parameter->parent === null) {
            return;
        }
        if ($parentId === null || $this->parameters->lockParent($parameter, $parentId) !== true) {
            throw ValidationException::field($parameter->parent->column, 'not_found');
        }
    }

    /** @return array<string, string> */
    private function snapshot(ParameterDefinition $parameter, string $name, ?string $color, ?string $parentId): array
    {
        $data = ['name' => $name];
        if ($color !== null) {
            $data['color'] = $color;
        }
        if ($parameter->parent !== null && $parentId !== null) {
            $data[$parameter->parent->column] = $parentId;
        }

        return $data;
    }
}
