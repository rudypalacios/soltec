<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Application;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use LogicException;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Settings\Domain\MarginLevelRecord;
use Soltec\Modules\Settings\Persistence\MarginLevelRepository;

/**
 * Administration of the margin levels. They have no data scope of their own: whoever may view them sees all of
 * them. There is always exactly one active default level; it cannot be deactivated, only replaced by another.
 * Changing a rate changes catalog prices at once (they are computed, never stored) and edits no issued quote.
 */
final class MarginLevelService
{
    private const ENTITY = 'margin_levels';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly MarginLevelRepository $levels,
        private readonly AuditLogger $audit,
    ) {
    }

    /**
     * @param string $status active, inactive or all
     * @return list<MarginLevelRecord>
     */
    public function list(string $status): array
    {
        return $this->levels->all($status);
    }

    public function get(string $id): MarginLevelRecord
    {
        return $this->levels->find($id) ?? throw ApiException::notFound();
    }

    /** The level a price is computed with when none is asked for. */
    public function default(): MarginLevelRecord
    {
        return $this->levels->findDefault()
            ?? throw new LogicException('There is no default margin level: run the migrations.');
    }

    public function create(ActorContext $actor, string $name, string $rate): MarginLevelRecord
    {
        $id = Uuid::v7();
        try {
            $this->connection->transactional(function () use ($actor, $id, $name, $rate): void {
                $this->levels->insert($id, $name, $rate, $this->clock->now());
                $this->audit->record($actor, 'create', self::ENTITY, $id, null, [
                    'name' => $name,
                    'rate' => $rate,
                    'is_default' => false,
                    'is_active' => true,
                ]);
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('name', 'taken');
        }

        return $this->get($id);
    }

    /** @throws ApiException 404 or 409 `conflict` (stale version) */
    public function update(ActorContext $actor, string $id, int $version, string $name, string $rate): MarginLevelRecord
    {
        try {
            $this->connection->transactional(function () use ($actor, $id, $version, $name, $rate): void {
                $level = $this->levels->find($id) ?? throw ApiException::notFound();
                if (!$this->levels->update($id, $version, $name, $rate, $this->clock->now())) {
                    throw ApiException::conflict();
                }

                $before = [];
                $after = [];
                if ($level->name !== $name) {
                    $before['name'] = $level->name;
                    $after['name'] = $name;
                }
                if ($level->rate !== $rate) {
                    $before['rate'] = $level->rate;
                    $after['rate'] = $rate;
                }
                if ($after !== []) {
                    $this->audit->record($actor, 'update', self::ENTITY, $id, $before, $after);
                }
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::field('name', 'taken');
        }

        return $this->get($id);
    }

    /**
     * Makes the level the default and retires the previous one in the same transaction. Idempotent.
     *
     * @throws ApiException 404, or 409 `conflict` when the level is deactivated
     */
    public function setDefault(ActorContext $actor, string $id): MarginLevelRecord
    {
        $this->connection->transactional(function () use ($actor, $id): void {
            $this->levels->lockAll();
            $level = $this->levels->find($id) ?? throw ApiException::notFound();
            if (!$level->isActive()) {
                throw ApiException::conflict('conflict', 'A deactivated margin level cannot be the default.');
            }
            if ($level->isDefault) {
                return;
            }

            $now = $this->clock->now();
            $previous = $this->levels->findDefault();
            if ($previous !== null) {
                $this->levels->setDefault($previous->id, false, $now);
                $this->audit->record($actor, 'update', self::ENTITY, $previous->id, ['is_default' => true], [
                    'is_default' => false,
                ]);
            }
            $this->levels->setDefault($id, true, $now);
            $this->audit->record($actor, 'update', self::ENTITY, $id, ['is_default' => false], [
                'is_default' => true,
            ]);
        });

        return $this->get($id);
    }

    /**
     * Idempotent. The default level is refused: another must become the default first.
     *
     * @throws ApiException 404, or 409 `default_margin_level`
     */
    public function deactivate(ActorContext $actor, string $id): MarginLevelRecord
    {
        $this->connection->transactional(function () use ($actor, $id): void {
            $this->levels->lockAll();
            $level = $this->levels->find($id) ?? throw ApiException::notFound();
            if (!$level->isActive()) {
                return;
            }
            if ($level->isDefault) {
                throw ApiException::conflict(
                    'default_margin_level',
                    'The default margin level cannot be deactivated: choose another default first.',
                );
            }

            $inUse = $this->connection->fetchOne(
                'SELECT COUNT(*) FROM clients WHERE margin_level_id = UNHEX(:id) AND deleted_at IS NULL',
                ['id' => Uuid::toHex($id)],
            );
            if (is_numeric($inUse) && (int) $inUse > 0) {
                throw ApiException::conflict(
                    'margin_level_in_use',
                    'Active clients use this margin level; change theirs first.',
                    ['active_client_count' => (int) $inUse],
                );
            }

            $now = $this->clock->now();
            $this->levels->setDeletedAt($id, $now, $now);
            $this->audit->record($actor, 'deactivate', self::ENTITY, $id, ['is_active' => true], [
                'is_active' => false,
            ]);
        });

        return $this->get($id);
    }

    /** Idempotent. Fails when an active level already has the same name. */
    public function reactivate(ActorContext $actor, string $id): MarginLevelRecord
    {
        try {
            $this->connection->transactional(function () use ($actor, $id): void {
                $level = $this->get($id);
                if ($level->isActive()) {
                    return;
                }

                $this->levels->setDeletedAt($id, null, $this->clock->now());
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
