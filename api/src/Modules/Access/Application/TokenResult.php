<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Application;

use Soltec\Kernel\Auth\CurrentUser;

/** What login and refresh hand to the controller. */
final class TokenResult
{
    /**
     * @param string|null $refreshToken the new refresh token in clear text; null only inside the grace window,
     *                                  when the sibling request already delivered it through the shared cookie
     */
    public function __construct(
        public readonly string $accessToken,
        public readonly bool $passwordChangeRequired,
        public readonly ?string $refreshToken,
        public readonly string $deviceId,
        public readonly string $platform,
        public readonly ?CurrentUser $user,
    ) {
    }
}
