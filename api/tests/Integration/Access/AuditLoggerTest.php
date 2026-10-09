<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use LogicException;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;

final class AuditLoggerTest extends AccessTestCase
{
    public function testRefusesToRecordPasswordsOrTokens(): void
    {
        $audit = $this->service(AuditLogger::class);
        $forbidden = [
            'password',
            'password_hash',
            'initial_password',
            'current_password',
            'new_password',
            'token',
            'refresh_token',
        ];

        foreach ($forbidden as $key) {
            foreach (['before', 'after'] as $side) {
                try {
                    $data = [$key => 'secret'];
                    $audit->record(
                        ActorContext::system(),
                        'update',
                        'users',
                        Uuid::v7(),
                        $side === 'before' ? $data : null,
                        $side === 'after' ? $data : null,
                    );
                    self::fail(sprintf('"%s" in %s_data must be refused.', $key, $side));
                } catch (LogicException) {
                    // Expected.
                }
            }
        }
        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM audit_logs'));
    }

    public function testStoresTheActorTheDeviceTheAddressAndTheMoment(): void
    {
        $admin = $this->createAdmin();
        $session = $this->sessionFor($admin['id']);
        $entityId = Uuid::v7();

        $this->service(AuditLogger::class)->record(
            new ActorContext($admin['id'], $session['deviceId'], '2001:db8::1'),
            'update',
            'users',
            $entityId,
            ['name' => 'Old'],
            ['name' => 'New'],
        );

        $row = $this->connection->fetchAssociative(
            'SELECT LOWER(HEX(user_id)) AS user_id, LOWER(HEX(device_id)) AS device_id, INET6_NTOA(ip_address) AS ip, '
            . 'occurred_at FROM audit_logs',
        );
        self::assertIsArray($row);
        self::assertSame(Uuid::toHex($admin['id']), $row['user_id']);
        self::assertSame(Uuid::toHex($session['deviceId']), $row['device_id']);
        self::assertSame('2001:db8::1', $row['ip']);
        self::assertSame('2026-10-09 12:00:00.000', $row['occurred_at']);
    }
}
