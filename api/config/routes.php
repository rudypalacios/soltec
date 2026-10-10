<?php

declare(strict_types=1);

use Slim\App;
use Slim\Routing\RouteCollectorProxy;
use Soltec\Kernel\Auth\AuthenticationMiddleware;
use Soltec\Kernel\Auth\PermissionMiddleware;
use Soltec\Kernel\Http\Controller\DeployController;
use Soltec\Kernel\Http\Controller\HealthController;
use Soltec\Kernel\Http\Controller\MailTestController;
use Soltec\Kernel\Http\Controller\RequirementsController;
use Soltec\Kernel\Http\DeployTokenMiddleware;
use Soltec\Modules\Access\Http\AuthController;
use Soltec\Modules\Access\Http\CatalogController;
use Soltec\Modules\Access\Http\CredentialController;
use Soltec\Modules\Access\Http\DeviceController;
use Soltec\Modules\Access\Http\MeController;
use Soltec\Modules\Access\Http\RoleController;
use Soltec\Modules\Access\Http\SecuritySettingsController;
use Soltec\Modules\Access\Http\UserController;
use Soltec\Modules\Organization\Http\DepartmentController;
use Soltec\Modules\Settings\Http\BrandingController;
use Soltec\Modules\Settings\Http\CompanyController;
use Soltec\Modules\Settings\Http\FinancialSettingsController;
use Soltec\Modules\Settings\Http\MarginLevelController;
use Soltec\Modules\Settings\Http\PriceController;
use Soltec\Modules\Settings\Http\SequenceController;

// Route table. Versioned public routes live under /v1 and must be described in contract/openapi.yaml.
// Every /v1 route declares its access rule in the "permission" argument: `public`, `authenticated` or
// `<resource>.<action>`. A route without it fails closed and a test catches it (ADR-0012). The "restricted"
// argument set to `allowed` lets a session that must change its password reach the route.
// Deployment routes live under /system, are not versioned and are protected by the deploy token.
// Group callables are not static: Slim binds them to the container.
return static function (App $app): void {
    $app->group('/v1', function (RouteCollectorProxy $group): void {
        $group->get('/health', HealthController::class)->setArgument('permission', 'public');

        $group->post('/auth/login', [AuthController::class, 'login'])->setArgument('permission', 'public');
        $group->post('/auth/refresh', [AuthController::class, 'refresh'])->setArgument('permission', 'public');
        $group->post('/auth/logout', [AuthController::class, 'logout'])
            ->setArguments(['permission' => 'authenticated', 'restricted' => 'allowed']);
        $group->post('/auth/password/change', [AuthController::class, 'changePassword'])
            ->setArguments(['permission' => 'authenticated', 'restricted' => 'allowed']);
        $group->post('/auth/invitations/accept', [CredentialController::class, 'acceptInvitation'])
            ->setArgument('permission', 'public');
        $group->post('/auth/password/forgot', [CredentialController::class, 'forgotPassword'])
            ->setArgument('permission', 'public');
        $group->post('/auth/password/reset', [CredentialController::class, 'resetPassword'])
            ->setArgument('permission', 'public');
        $group->get('/me', [MeController::class, 'show'])->setArgument('permission', 'authenticated');
        $group->get('/me/devices', [DeviceController::class, 'list'])->setArgument('permission', 'authenticated');
        $group->delete('/me/devices/{deviceId}', [DeviceController::class, 'revoke'])
            ->setArgument('permission', 'authenticated');

        $group->get('/users', [UserController::class, 'list'])->setArgument('permission', 'users.view');
        $group->post('/users', [UserController::class, 'create'])->setArgument('permission', 'users.create');
        $group->get('/users/{userId}', [UserController::class, 'show'])->setArgument('permission', 'users.view');
        $group->patch('/users/{userId}', [UserController::class, 'update'])->setArgument('permission', 'users.edit');
        $group->post('/users/{userId}/invite', [UserController::class, 'invite'])
            ->setArgument('permission', 'users.edit');
        $group->post('/users/{userId}/unlock', [UserController::class, 'unlock'])
            ->setArgument('permission', 'users.edit');
        $group->post('/users/{userId}/deactivate', [UserController::class, 'deactivate'])
            ->setArgument('permission', 'users.deactivate');
        $group->post('/users/{userId}/reactivate', [UserController::class, 'reactivate'])
            ->setArgument('permission', 'users.deactivate');

        $group->get('/roles', [RoleController::class, 'list'])->setArgument('permission', 'roles.view');
        $group->post('/roles', [RoleController::class, 'create'])->setArgument('permission', 'roles.create');
        $group->get('/roles/{roleId}', [RoleController::class, 'show'])->setArgument('permission', 'roles.view');
        $group->patch('/roles/{roleId}', [RoleController::class, 'update'])->setArgument('permission', 'roles.edit');
        $group->post('/roles/{roleId}/deactivate', [RoleController::class, 'deactivate'])
            ->setArgument('permission', 'roles.deactivate');
        $group->post('/roles/{roleId}/reactivate', [RoleController::class, 'reactivate'])
            ->setArgument('permission', 'roles.deactivate');

        $group->get('/departments', [DepartmentController::class, 'list'])
            ->setArgument('permission', 'departments.view');
        $group->post('/departments', [DepartmentController::class, 'create'])
            ->setArgument('permission', 'departments.create');
        $group->get('/departments/{departmentId}', [DepartmentController::class, 'show'])
            ->setArgument('permission', 'departments.view');
        $group->patch('/departments/{departmentId}', [DepartmentController::class, 'update'])
            ->setArgument('permission', 'departments.edit');
        $group->post('/departments/{departmentId}/deactivate', [DepartmentController::class, 'deactivate'])
            ->setArgument('permission', 'departments.deactivate');
        $group->post('/departments/{departmentId}/reactivate', [DepartmentController::class, 'reactivate'])
            ->setArgument('permission', 'departments.deactivate');

        $group->get('/branding', [BrandingController::class, 'show'])->setArgument('permission', 'public');
        $group->get('/branding/logo', [BrandingController::class, 'logo'])->setArgument('permission', 'public');
        $group->get('/settings/company', [CompanyController::class, 'show'])
            ->setArgument('permission', 'company.view');
        $group->patch('/settings/company', [CompanyController::class, 'update'])
            ->setArgument('permission', 'company.edit');
        $group->put('/settings/company/logo', [CompanyController::class, 'uploadLogo'])
            ->setArgument('permission', 'company.edit');
        $group->delete('/settings/company/logo', [CompanyController::class, 'deleteLogo'])
            ->setArgument('permission', 'company.edit');
        $group->get('/settings/financial', [FinancialSettingsController::class, 'show'])
            ->setArgument('permission', 'financial_settings.view');
        $group->patch('/settings/financial', [FinancialSettingsController::class, 'update'])
            ->setArgument('permission', 'financial_settings.edit');
        $group->get('/settings/security', [SecuritySettingsController::class, 'show'])
            ->setArgument('permission', 'security_settings.view');
        $group->patch('/settings/security', [SecuritySettingsController::class, 'update'])
            ->setArgument('permission', 'security_settings.edit');
        $group->get('/sequences', [SequenceController::class, 'list'])->setArgument('permission', 'sequences.view');
        $group->patch('/sequences/{code}', [SequenceController::class, 'update'])
            ->setArgument('permission', 'sequences.edit');

        $group->get('/margin-levels', [MarginLevelController::class, 'list'])
            ->setArgument('permission', 'margin_levels.view');
        $group->post('/margin-levels', [MarginLevelController::class, 'create'])
            ->setArgument('permission', 'margin_levels.create');
        $group->get('/margin-levels/{marginLevelId}', [MarginLevelController::class, 'show'])
            ->setArgument('permission', 'margin_levels.view');
        $group->patch('/margin-levels/{marginLevelId}', [MarginLevelController::class, 'update'])
            ->setArgument('permission', 'margin_levels.edit');
        $group->post('/margin-levels/{marginLevelId}/set-default', [MarginLevelController::class, 'setDefault'])
            ->setArgument('permission', 'margin_levels.edit');
        $group->post('/margin-levels/{marginLevelId}/deactivate', [MarginLevelController::class, 'deactivate'])
            ->setArgument('permission', 'margin_levels.deactivate');
        $group->post('/margin-levels/{marginLevelId}/reactivate', [MarginLevelController::class, 'reactivate'])
            ->setArgument('permission', 'margin_levels.deactivate');
        $group->post('/price/calculate', [PriceController::class, 'calculate'])
            ->setArgument('permission', 'margin_levels.view');

        $group->get('/resources', [CatalogController::class, 'resources'])->setArgument('permission', 'roles.view');
        $group->get('/permissions', [CatalogController::class, 'permissions'])->setArgument('permission', 'roles.view');
        // Middleware run in the reverse order they are added: authentication first, then the permission check.
    })->add(PermissionMiddleware::class)->add(AuthenticationMiddleware::class);

    // Open on purpose while the project starts (decision of the user): it is only reachable by URL, it is not in
    // the contract and it asks crawlers to stay away. TODO.md lists protecting it before real data arrives.
    $app->get('/system/requirements', [RequirementsController::class, 'check']);

    $app->group('/system', function (RouteCollectorProxy $group): void {
        $group->post('/migrations/apply', [DeployController::class, 'applyMigrations']);
        $group->get('/diagnostics', [DeployController::class, 'diagnostics']);
        $group->post('/mail/test', [MailTestController::class, 'send']);
    })->add(DeployTokenMiddleware::class);
};
