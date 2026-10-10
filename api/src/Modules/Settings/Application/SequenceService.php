<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Application;

use DateTimeImmutable;
use DateTimeZone;
use Doctrine\DBAL\Connection;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Settings\Domain\SequenceRecord;
use Soltec\Modules\Settings\Persistence\CompanyRepository;
use Soltec\Modules\Settings\Persistence\SequenceRepository;

/**
 * Administration of the numbering rules. Sequences are created by the migration of the module that issues the
 * documents, never from here. Issuing a number is {@see SequenceGenerator}.
 */
final class SequenceService
{
    private const ENTITY = 'sequences';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly SequenceRepository $sequences,
        private readonly CompanyRepository $company,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return list<array<string, mixed>> the `Sequence` schema of each one */
    public function list(): array
    {
        $now = $this->localNow();

        return array_map(static fn (SequenceRecord $s): array => $s->toApi($now), $this->sequences->all());
    }

    /** @return array<string, mixed> the `Sequence` schema */
    public function get(string $code): array
    {
        $sequence = $this->sequences->find($code) ?? throw ApiException::notFound();

        return $sequence->toApi($this->localNow());
    }

    /**
     * The period cannot change once a number was issued, and the counter can only go up: both would otherwise let a
     * number repeat.
     *
     * @return array<string, mixed> the `Sequence` schema
     * @throws ApiException 404, or 409 `conflict` (stale version)
     * @throws ValidationException `period` `locked`, `next_value` `too_low`
     */
    public function update(
        ActorContext $actor,
        string $code,
        int $version,
        string $prefix,
        int $padding,
        string $period,
        int $nextValue,
    ): array {
        $this->connection->transactional(function () use (
            $actor,
            $code,
            $version,
            $prefix,
            $padding,
            $period,
            $nextValue,
        ): void {
            $current = $this->sequences->find($code, lock: true) ?? throw ApiException::notFound();
            if ($current->version !== $version) {
                throw ApiException::conflict();
            }
            if ($period !== $current->period && $current->hasIssuedNumbers()) {
                throw ValidationException::field('period', 'locked');
            }
            if ($nextValue < $current->nextValue) {
                throw ValidationException::field('next_value', 'too_low');
            }

            $before = ['prefix' => $current->prefix, 'padding' => $current->padding, 'period' => $current->period,
                'next_value' => $current->nextValue];
            $after = ['prefix' => $prefix, 'padding' => $padding, 'period' => $period, 'next_value' => $nextValue];
            $changed = array_keys(array_diff_assoc($after, $before));
            if ($changed === []) {
                return;
            }

            $this->sequences->update($code, $prefix, $padding, $period, $nextValue, $this->clock->now());
            // The primary key is a code, not a UUID, so it travels inside the entry instead of in `entity_id`.
            $this->audit->record(
                $actor,
                'update',
                self::ENTITY,
                null,
                ['code' => $code] + array_intersect_key($before, array_flip($changed)),
                ['code' => $code] + array_intersect_key($after, array_flip($changed)),
            );
        });

        return $this->get($code);
    }

    private function localNow(): DateTimeImmutable
    {
        return $this->clock->now()->setTimezone(new DateTimeZone($this->company->get()->timezone));
    }
}
