<?php

declare(strict_types=1);

namespace Soltec\Kernel\Auth;

/** Which rows of a resource a role reaches. Without an entry the scope is `own`. */
enum DataScope: string
{
    case Own = 'own';
    case Team = 'team';
    case All = 'all';
    case Client = 'client';

    /** With several roles the widest wins: all, then team, then own. `client` stands alone (external roles). */
    public function breadth(): int
    {
        return match ($this) {
            self::Own, self::Client => 1,
            self::Team => 2,
            self::All => 3,
        };
    }

    public function widest(self $other): self
    {
        return $other->breadth() > $this->breadth() ? $other : $this;
    }
}
