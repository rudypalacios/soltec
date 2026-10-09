<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel\Auth;

use PHPUnit\Framework\TestCase;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Auth\DataScope;
use Soltec\Kernel\Auth\RoleRef;

final class CurrentUserTest extends TestCase
{
    public function testDeniesByDefault(): void
    {
        $user = $this->user([], []);

        self::assertFalse($user->can('users', 'view'));
        self::assertFalse($user->can('anything', 'else'));
    }

    public function testAllowsOnlyWhatWasGranted(): void
    {
        $user = $this->user(['users' => ['view', 'edit']], []);

        self::assertTrue($user->can('users', 'view'));
        self::assertTrue($user->can('users', 'edit'));
        self::assertFalse($user->can('users', 'deactivate'));
        self::assertFalse($user->can('roles', 'view'));
    }

    public function testTheScopeDefaultsToOwn(): void
    {
        $user = $this->user([], ['users' => DataScope::All]);

        self::assertSame(DataScope::All, $user->scopeFor('users'));
        self::assertSame(DataScope::Own, $user->scopeFor('roles'));
    }

    public function testTheWidestScopeWins(): void
    {
        self::assertSame(DataScope::All, DataScope::Own->widest(DataScope::All));
        self::assertSame(DataScope::All, DataScope::All->widest(DataScope::Team));
        self::assertSame(DataScope::Team, DataScope::Own->widest(DataScope::Team));
        self::assertSame(DataScope::Own, DataScope::Own->widest(DataScope::Own));
    }

    public function testAdministratorsAreRecognisedByTheRoleCode(): void
    {
        $admin = new CurrentUser(
            'u',
            'd',
            'internal',
            'A',
            'a@x.com',
            [new RoleRef('r', 'admin', 'Administrador')],
            [],
            [],
            false,
        );
        $named = new CurrentUser(
            'u',
            'd',
            'internal',
            'A',
            'a@x.com',
            [new RoleRef('r', null, 'admin')],
            [],
            [],
            false,
        );

        self::assertTrue($admin->isAdmin());
        self::assertFalse($named->isAdmin());
    }

    /**
     * @param array<string, list<string>> $permissions
     * @param array<string, DataScope> $scopes
     */
    private function user(array $permissions, array $scopes): CurrentUser
    {
        return new CurrentUser('u', 'd', 'internal', 'Name', 'a@x.com', [], $permissions, $scopes, false);
    }
}
