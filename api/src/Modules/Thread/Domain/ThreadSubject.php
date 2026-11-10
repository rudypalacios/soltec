<?php

declare(strict_types=1);

namespace Soltec\Modules\Thread\Domain;

use Soltec\Kernel\Auth\CurrentUser;

/**
 * A kind of record that owns a thread (tasks first, tickets later). The thread knows nothing about the record: it asks
 * its subject who can see it, and a record outside that answer does not exist for the asker (404).
 */
interface ThreadSubject
{
    /** The value stored in `thread_entries.subject_type`, e.g. `task`. */
    public function type(): string;

    /** Whether the user reaches the record: because they are involved in it, or by permission and data scope. */
    public function canSee(CurrentUser $user, string $subjectId): bool;
}
