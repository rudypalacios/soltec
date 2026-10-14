<?php

declare(strict_types=1);

namespace Soltec\Modules\Suppliers\Application;

use Soltec\Modules\Access\Application\ActorContext;

/**
 * What follows a supplier being deactivated (ADR-0023). Suppliers own the table that products point at, so they do
 * not import anything from the products: they define this port and the module that holds the dependants implements
 * it, wired by the container.
 */
interface DeactivationCascade
{
    /**
     * Deactivates, in the transaction of the supplier, whatever depends on it and audits each one.
     *
     * @return int how many were deactivated
     */
    public function deactivateFor(ActorContext $actor, string $supplierId): int;

    /** How many dependants are inactive only because their supplier is (they are not reactivated with it). */
    public function inactiveCountFor(string $supplierId): int;
}
