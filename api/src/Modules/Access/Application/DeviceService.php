<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Application;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Modules\Access\Domain\DeviceRecord;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Access\Persistence\SessionRepository;

/** The signed-in user's own sessions: see where they are open and close any of them. */
final class DeviceService
{
    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly SessionRepository $sessions,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return list<DeviceRecord> */
    public function list(CurrentUser $caller): array
    {
        return $this->sessions->listSessions($caller->id, $caller->deviceId, $this->clock->now());
    }

    /**
     * Closing the device of the call itself is the same as signing out.
     *
     * @throws ApiException 404 when the device is not the caller's or is already closed (the same answer for both,
     *     so an id of someone else's device is not confirmed)
     */
    public function revoke(CurrentUser $caller, ActorContext $actor, string $deviceId): void
    {
        $this->connection->transactional(function () use ($caller, $actor, $deviceId): void {
            $device = $this->sessions->findOwnDevice($caller->id, $deviceId) ?? throw ApiException::notFound();

            $this->sessions->revokeDevice($deviceId, $this->clock->now());
            $this->audit->record($actor, 'device_revoke', 'devices', $deviceId, $device, null);
        });
    }
}
