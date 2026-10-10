<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Domain;

/** A related record shown by its name, such as the department or the manager of a user. */
final class NamedRef
{
    public function __construct(public readonly string $id, public readonly string $name)
    {
    }

    /** @return array{id: string, name: string} */
    public function toArray(): array
    {
        return ['id' => $this->id, 'name' => $this->name];
    }
}
