<?php

declare(strict_types=1);

namespace Soltec\Modules\Notifications\Domain;

/**
 * Every kind of notice the application sends. The list is code, not configuration (ADR-0031): who receives each one is
 * decided by the module that publishes it, and a module that appears later adds its own cases here. The value is what
 * is stored and what the API returns; the web writes the sentence from it and from the notice's data.
 */
enum NotificationType: string
{
    // A person was given, or taken off, something to do.
    case Assigned = 'assigned';
    case Unassigned = 'unassigned';
    case AssigneeChanged = 'assignee_changed';

    // Something happened in the thread of a record the person is involved in.
    case Comment = 'comment';
    case Mention = 'mention';

    // The record changed.
    case StateChanged = 'state_changed';
    case DueDateChanged = 'due_date_changed';

    // The scheduled reminders (`notifications:run`).
    case DueSoon = 'due_soon';
    case Overdue = 'overdue';

    // Clients: an adviser was added to one, or taken off it.
    case ClientSellerAdded = 'client_seller_added';
    case ClientSellerRemoved = 'client_seller_removed';

    /** A notice nobody caused (the clock did): it has no actor and the actor rule does not apply. */
    public function isReminder(): bool
    {
        return $this === self::DueSoon || $this === self::Overdue;
    }
}
