<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 1.1: roles (perfiles), the resource and permission catalogs and the role matrix (docs/arquitectura/erd/
 * 01-fundaciones.md, "01 Acceso y permisos"). Statements are idempotent: MySQL cannot roll back DDL, so a run that
 * stopped half way must be able to continue.
 */
final class CreateRolesAndPermissionsTables extends AbstractMigration
{
    private const TABLE_OPTIONS = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS resources ('
            . 'code VARCHAR(50) NOT NULL, '
            . 'name VARCHAR(100) NOT NULL, '
            . 'PRIMARY KEY (code)'
            . ')' . self::TABLE_OPTIONS,
        );
        $this->execute(
            'CREATE TABLE IF NOT EXISTS permissions ('
            . 'code VARCHAR(50) NOT NULL, '
            . 'name VARCHAR(100) NOT NULL, '
            . 'PRIMARY KEY (code)'
            . ')' . self::TABLE_OPTIONS,
        );
        $this->execute(
            'CREATE TABLE IF NOT EXISTS roles ('
            . 'id BINARY(16) NOT NULL, '
            . 'code VARCHAR(50) NULL, '
            . 'name VARCHAR(100) NOT NULL, '
            . 'active_name VARCHAR(100) GENERATED ALWAYS AS (IF(deleted_at IS NULL, name, NULL)) STORED, '
            . 'description VARCHAR(255) NULL, '
            . "user_type ENUM('internal','external') NOT NULL, "
            . 'is_system TINYINT(1) NOT NULL DEFAULT 0, '
            . 'created_at DATETIME(3) NOT NULL, '
            . 'updated_at DATETIME(3) NOT NULL, '
            . 'version INT UNSIGNED NOT NULL DEFAULT 1, '
            . 'deleted_at DATETIME(3) NULL, '
            . 'PRIMARY KEY (id), '
            . 'UNIQUE KEY uq_roles_code (code), '
            . 'UNIQUE KEY uq_roles_active_name (active_name), '
            . 'KEY idx_roles_updated (updated_at)'
            . ')' . self::TABLE_OPTIONS,
        );
        $this->execute(
            'CREATE TABLE IF NOT EXISTS role_permissions ('
            . 'role_id BINARY(16) NOT NULL, '
            . 'resource_code VARCHAR(50) NOT NULL, '
            . 'permission_code VARCHAR(50) NOT NULL, '
            . 'PRIMARY KEY (role_id, resource_code, permission_code), '
            . 'KEY idx_role_permissions_resource (resource_code), '
            . 'KEY idx_role_permissions_permission (permission_code), '
            . 'CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_role_permissions_resource FOREIGN KEY (resource_code) REFERENCES resources (code) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_code) REFERENCES permissions (code) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );
        $this->execute(
            'CREATE TABLE IF NOT EXISTS role_scopes ('
            . 'role_id BINARY(16) NOT NULL, '
            . 'resource_code VARCHAR(50) NOT NULL, '
            . "scope ENUM('own','team','all','client') NOT NULL, "
            . 'PRIMARY KEY (role_id, resource_code), '
            . 'KEY idx_role_scopes_resource (resource_code), '
            . 'CONSTRAINT fk_role_scopes_role FOREIGN KEY (role_id) REFERENCES roles (id) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT, '
            . 'CONSTRAINT fk_role_scopes_resource FOREIGN KEY (resource_code) REFERENCES resources (code) '
            . 'ON DELETE RESTRICT ON UPDATE RESTRICT'
            . ')' . self::TABLE_OPTIONS,
        );
    }

    public function down(): void
    {
        foreach (['role_scopes', 'role_permissions', 'roles', 'permissions', 'resources'] as $table) {
            $this->execute('DROP TABLE IF EXISTS ' . $table);
        }
    }
}
