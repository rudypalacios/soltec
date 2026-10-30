<?php

declare(strict_types=1);

namespace Soltec\Modules\Workflow\Domain;

/**
 * The flows the system knows. A new one is a case here plus a migration that seeds its states: there is no screen to
 * create flows, because each one exists for a module that reads it.
 */
enum WorkflowCode: string
{
    case Task = 'task';
    case Ticket = 'ticket';

    /** The flow a route names, or null for a code the system does not know. */
    public static function fromRoute(string $code): ?self
    {
        return self::tryFrom($code);
    }
}
