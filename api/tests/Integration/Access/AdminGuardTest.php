<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Auth\DataScope;
use Soltec\Kernel\Auth\RoleRef;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Application\UserService;

/**
 * The HTTP rules already keep the last administrator safe (an administrator who acts is active, so the target is
 * never the last one). These tests call the service with a caller whose administrator role was just revoked, the
 * race the guard exists for, so the guard itself is proven and not only the rules in front of it.
 */
final class AdminGuardTest extends AccessTestCase
{
    public function testTheLastActiveAdministratorCannotBeDeactivated(): void
    {
        $only = $this->createAdmin();

        $this->assertLastAdmin(fn () => $this->service(UserService::class)->deactivate(
            $this->staleAdministrator(),
            ActorContext::system(),
            $only['id'],
        ));

        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM users WHERE deleted_at IS NOT NULL'));
    }

    public function testTheLastActiveAdministratorCannotLoseTheRole(): void
    {
        $only = $this->createAdmin();
        $other = $this->createRole('Other');

        $this->assertLastAdmin(fn () => $this->service(UserService::class)->update(
            $this->staleAdministrator(),
            ActorContext::system(),
            $only['id'],
            1,
            null,
            null,
            [$other],
        ));

        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM user_roles WHERE role_id = UNHEX(:id)', [
            'id' => Uuid::toHex($this->adminRoleId()),
        ]));
    }

    public function testASecondActiveAdministratorLiftsTheRestriction(): void
    {
        $first = $this->createAdmin();
        $this->createAdmin('second@example.com');

        $deactivated = $this->service(UserService::class)->deactivate(
            $this->staleAdministrator(),
            ActorContext::system(),
            $first['id'],
        );

        self::assertFalse($deactivated->isActive());
    }

    private function assertLastAdmin(callable $action): void
    {
        try {
            $action();
            self::fail('The last administrator must be protected.');
        } catch (ApiException $error) {
            self::assertSame(409, $error->status);
            self::assertSame('last_admin', $error->errorCode);
        }
    }

    /** Someone who passed the "is an administrator" checks a moment ago and is no longer one in the database. */
    private function staleAdministrator(): CurrentUser
    {
        return new CurrentUser(
            Uuid::v7(),
            Uuid::v7(),
            'internal',
            'Stale',
            'stale@example.com',
            [new RoleRef(Uuid::v7(), CurrentUser::ADMIN_ROLE_CODE, 'Administrador')],
            ['users' => ['view', 'edit', 'deactivate']],
            ['users' => DataScope::All],
            false,
        );
    }
}
