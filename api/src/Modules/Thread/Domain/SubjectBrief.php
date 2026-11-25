<?php

declare(strict_types=1);

namespace Soltec\Modules\Thread\Domain;

/** What the thread needs to tell people about a record: how to call it and who is involved in it. */
final class SubjectBrief
{
    /** @param list<string> $participantIds the people told of every change of the record (owner, assignee) */
    public function __construct(public readonly string $title, public readonly array $participantIds)
    {
    }
}
