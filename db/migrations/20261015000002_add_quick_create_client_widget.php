<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Slice 2.5 (clients): the home widget that registers a prospect. It goes to the roles that may already create
 * clients (`admin`, which this slice's earlier migration granted them), after the widgets they have, so no one's home
 * screen changes unless they can use the new one. Idempotent, and it uses no application class because the deployment
 * applies migrations before it uploads the new code.
 */
final class AddQuickCreateClientWidget extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            'INSERT IGNORE INTO role_widgets (role_id, widget_code, position) '
            . "SELECT rp.role_id, 'quick_create_client', COALESCE(("
            . 'SELECT MAX(w.position) FROM role_widgets w WHERE w.role_id = rp.role_id), 0) + 1 '
            . "FROM role_permissions rp WHERE rp.resource_code = 'clients' AND rp.permission_code = 'create'",
        );
    }

    public function down(): void
    {
        $this->execute("DELETE FROM role_widgets WHERE widget_code = 'quick_create_client'");
    }
}
