<?php

declare(strict_types=1);

namespace Soltec\Kernel\Auth;

/** Implemented by the Access module: the Kernel does not know where users and permissions live. */
interface CurrentUserLoader
{
    /** @return CurrentUser|null null when the user is inactive or the device was revoked */
    public function load(AccessClaims $claims): ?CurrentUser;
}
