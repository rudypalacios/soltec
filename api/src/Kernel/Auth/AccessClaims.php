<?php

declare(strict_types=1);

namespace Soltec\Kernel\Auth;

/** What the access token says: who, on which device, and whether it only serves to change the password. */
final class AccessClaims
{
    public function __construct(
        public readonly string $userId,
        public readonly string $deviceId,
        public readonly bool $restricted,
    ) {
    }
}
