<?php

declare(strict_types=1);

namespace Soltec\Kernel\Auth;

/** The short form of a role that travels inside users and sessions. */
final class RoleRef
{
    public function __construct(
        public readonly string $id,
        public readonly ?string $code,
        public readonly string $name,
    ) {
    }

    /** @return array{id: string, code: string|null, name: string} */
    public function toArray(): array
    {
        return ['id' => $this->id, 'code' => $this->code, 'name' => $this->name];
    }
}
