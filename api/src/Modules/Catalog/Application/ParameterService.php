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
 * Administration of the catalog parameters. They have no data scope: whoever may view one sees all its values. A
 * deactivated value blocks nothing and drags nothing along (ADR-0023): the records that use it keep it.
 */
final class ParameterService
{
    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly ParameterRepository $parameters,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return array{records: list<ParameterRecord>, total: int} */
    public function list(ParameterDefinition $parameter, ?string $text, string $status, Pagination $page): array
    {
        return $this->parameters->search($parameter, $text, $status, $page);
    }

    public function get(ParameterDefinition $parameter, string $id): ParameterRecord
    {
        return $this->parameters->find($parameter, $id) ?? throw ApiException::notFound();
    }

    public function create(
        ActorContext $actor,
        ParameterDefinition $parameter,
        string $name,
        ?string $color,
    ): ParameterRecord {
        $id = Uuid::v7();
        try {
            $this->connection->transactional(function () use ($actor, $parameter, $id, $name, $color): void {
                $this->parameters->insert($parameter, $id, $name, $color, $this->clock->now());
                $this->audit->record(
                    $actor,
                    'create',
                    $parameter->table,
                    $id,
                    null,
                    $this->snapshot($name, $color) + ['is_active' => true],
                );
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('name', 'taken');
        }

        return $this->get($parameter, $id);
    }

    /** @throws ApiException 404 or 409 `conflict` (stale version) */
    public function update(
        ActorContext $actor,
        ParameterDefinition $parameter,
        string $id,
        int $version,
        string $name,
        ?string $color,
    ): ParameterRecord {
        try {
            $this->connection->transactional(function () use ($actor, $parameter, $id, $version, $name, $color): void {
                $current = $this->parameters->find($parameter, $id) ?? throw ApiException::notFound();
                if (!$this->parameters->update($parameter, $id, $version, $name, $color, $this->clock->now())) {
                    throw ApiException::conflict();
                }
                $before = $this->snapshot($current->name, $current->color);
                $after = $this->snapshot($name, $color);
                if ($before !== $after) {
                    $this->audit->record($actor, 'update', $parameter->table, $id, $before, $after);
                }
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('name', 'taken');
        }

        return $this->get($parameter, $id);
    }

    /** Idempotent and never refused: nothing depends on a value in a way that must stop it (ADR-0023). */
    public function deactivate(ActorContext $actor, ParameterDefinition $parameter, string $id): ParameterRecord
    {
        $this->connection->transactional(function () use ($actor, $parameter, $id): void {
            if (!$this->parameters->lock($parameter, $id)) {
                throw ApiException::notFound();
            }
            if (!$this->get($parameter, $id)->isActive()) {
                return;
            }

            $now = $this->clock->now();
            $this->parameters->setDeletedAt($parameter, $id, $now, $now);
            $this->audit->record($actor, 'deactivate', $parameter->table, $id, ['is_active' => true], [
                'is_active' => false,
            ]);
        });

        return $this->get($parameter, $id);
    }

    /** Idempotent. Fails when an active value already has the same name. */
    public function reactivate(ActorContext $actor, ParameterDefinition $parameter, string $id): ParameterRecord
    {
        try {
            $this->connection->transactional(function () use ($actor, $parameter, $id): void {
                if (!$this->parameters->lock($parameter, $id)) {
                    throw ApiException::notFound();
                }
                if ($this->get($parameter, $id)->isActive()) {
                    return;
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

    /** @return array<string, string> */
    private function snapshot(string $name, ?string $color): array
    {
        return $color === null ? ['name' => $name] : ['name' => $name, 'color' => $color];
    }
}
