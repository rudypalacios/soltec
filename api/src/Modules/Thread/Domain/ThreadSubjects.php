<?php

declare(strict_types=1);

namespace Soltec\Modules\Thread\Domain;

use LogicException;

/** The kinds of record that have a thread, by type. */
final class ThreadSubjects
{
    /** @var array<string, ThreadSubject> */
    private array $byType = [];

    /** @param list<ThreadSubject> $subjects */
    public function __construct(array $subjects)
    {
        foreach ($subjects as $subject) {
            $this->byType[$subject->type()] = $subject;
        }
    }

    public function get(string $type): ThreadSubject
    {
        return $this->byType[$type] ?? throw new LogicException(sprintf('No thread subject "%s".', $type));
    }
}
