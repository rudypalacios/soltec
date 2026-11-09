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

    /** Whether the user reaches the record, by permission and by data scope. */
    public function canSee(CurrentUser $user, string $subjectId): bool;

    /**
     * Of these users, the ones who reach the record (the people a comment may mention).
     *
     * @param list<string> $userIds
     * @return list<string>
     */
    public function whoCanSee(string $subjectId, array $userIds): array;
}
