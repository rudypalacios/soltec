<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;
use Soltec\Kernel\Uuid;

/**
 * Slice 1.1 seed: the `users` and `roles` resources, the four permission verbs and the immutable `admin` role with
 * every permission and the `all` scope. A later module adds its own resource in its own migration and grants it to
 * `admin` the same way (ADR-0012). Idempotent, so a half-applied run can continue.
 */
final class SeedAccessCatalogsAndAdminRole extends AbstractMigration
{
    private const RESOURCES = ['users' => 'Usuarios', 'roles' => 'Perfiles'];
    private const PERMISSIONS = [
        'view' => 'Ver',
        'create' => 'Crear',
        'edit' => 'Editar',
        'deactivate' => 'Desactivar',
    ];

    public function up(): void
    {
        foreach (self::RESOURCES as $code => $name) {
            $this->execute(sprintf("INSERT IGNORE INTO resources (code, name) VALUES ('%s', '%s')", $code, $name));
        }
        foreach (self::PERMISSIONS as $code => $name) {
            $this->execute(sprintf("INSERT IGNORE INTO permissions (code, name) VALUES ('%s', '%s')", $code, $name));
        }

        $this->execute(sprintf(
            "INSERT INTO roles (id, code, name, description, user_type, is_system, created_at, updated_at) "
            . "SELECT UNHEX('%s'), 'admin', 'Administrador', "
            . "'Acceso total. Perfil de sistema, no se puede modificar.', "
            . "'internal', 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3) FROM DUAL "
            . "WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'admin')",
            Uuid::toHex(Uuid::v7()),
        ));

        $this->execute(
            'INSERT IGNORE INTO role_permissions (role_id, resource_code, permission_code) '
            . "SELECT r.id, res.code, p.code FROM roles r CROSS JOIN resources res CROSS JOIN permissions p "
            . "WHERE r.code = 'admin' AND res.code IN ('users', 'roles')",
        );
        $this->execute(
            'INSERT IGNORE INTO role_scopes (role_id, resource_code, scope) '
            . "SELECT r.id, res.code, 'all' FROM roles r CROSS JOIN resources res "
            . "WHERE r.code = 'admin' AND res.code IN ('users', 'roles')",
        );
    }

    public function down(): void
    {
        $this->execute("DELETE FROM role_scopes WHERE role_id IN (SELECT id FROM roles WHERE code = 'admin')");
        $this->execute("DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE code = 'admin')");
        $this->execute("DELETE FROM roles WHERE code = 'admin'");
        $this->execute("DELETE FROM permissions WHERE code IN ('view', 'create', 'edit', 'deactivate')");
        $this->execute("DELETE FROM resources WHERE code IN ('users', 'roles')");
    }
}
