<?php

declare(strict_types=1);

namespace Soltec\Kernel\Deploy;

/**
 * Work a module needs done right after the migrations of a deployment, from the web server's own PHP (the terminal
 * of a shared host may run an older PHP). It must be safe to run on every deployment: it does nothing when there
 * is nothing to do. The Kernel does not know modules, so each one contributes through this interface.
 */
interface PostMigrationStep
{
    /** Short stable name, the key of the deployment response. */
    public function name(): string;

    /** @return string a stable status code for the deployment log; never a secret */
    public function run(): string;
}
