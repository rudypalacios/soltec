<?php

declare(strict_types=1);

namespace Soltec\Modules\Thread\Application;

use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Modules\Files\Application\FileAccessGrant;
use Soltec\Modules\Thread\Domain\ThreadSubjects;
use Soltec\Modules\Thread\Persistence\ThreadRepository;

/** A photo attached to a comment is seen by whoever can read the thread of that record (ADR-0027). */
final class ThreadFileAccessGrant implements FileAccessGrant
{
    public function __construct(private readonly ThreadRepository $entries, private readonly ThreadSubjects $subjects)
    {
    }

    public function mayRead(CurrentUser $reader, string $fileId): bool
    {
        if (!$reader->can('thread_entries', 'view')) {
            return false;
        }
        foreach ($this->entries->subjectsHoldingFile($fileId) as $subject) {
            if ($this->subjects->get($subject['type'])->canSee($reader, $subject['id'])) {
                return true;
            }
        }

        return false;
    }
}
