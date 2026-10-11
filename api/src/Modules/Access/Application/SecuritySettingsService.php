<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Application;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Modules\Access\Domain\SecuritySettingsRecord;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Access\Persistence\SecuritySettingsRepository;

/** The lockout, password and session parameters an administrator may tune within the limits of the record. */
final class SecuritySettingsService
{
    private const ENTITY = 'security_settings';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly SecuritySettingsRepository $settings,
        private readonly AuditLogger $audit,
    ) {
    }

    public function get(): SecuritySettingsRecord
    {
        return $this->settings->get();
    }

    /**
     * @param array<string, int> $values every parameter of SecuritySettingsRecord::LIMITS, already within its limits
     * @throws ApiException 409 `conflict` when the version is stale
     */
    public function update(ActorContext $actor, int $version, array $values): SecuritySettingsRecord
    {
        $this->connection->transactional(function () use ($actor, $version, $values): void {
            $current = $this->settings->get(lock: true);
            if ($current->version !== $version) {
                throw ApiException::conflict();
            }

            $before = $current->auditData();
            $changed = array_keys(array_diff_assoc($values, $before));
            if ($changed === []) {
                return;
            }

            $this->settings->update($values, $version, $this->clock->now());
            $this->audit->record(
                $actor,
                'update',
                self::ENTITY,
                $current->id,
                array_intersect_key($before, array_flip($changed)),
                array_intersect_key($values, array_flip($changed)),
            );
        });

        return $this->settings->get();
    }
}
