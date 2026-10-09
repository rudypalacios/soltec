<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Application;

use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Auth\AuthenticationMiddleware;
use Soltec\Kernel\Auth\CurrentUser;

/** Who did something, from where: the data the audit log needs besides the change itself. */
final class ActorContext
{
    public function __construct(
        public readonly ?string $userId,
        public readonly ?string $deviceId,
        public readonly ?string $ip,
    ) {
    }

    /** The console and other system tasks. */
    public static function system(): self
    {
        return new self(null, null, null);
    }

    public static function fromRequest(ServerRequestInterface $request): self
    {
        $user = $request->getAttribute(AuthenticationMiddleware::USER_ATTRIBUTE);
        $ip = $request->getServerParams()['REMOTE_ADDR'] ?? null;

        return new self(
            $user instanceof CurrentUser ? $user->id : null,
            $user instanceof CurrentUser ? $user->deviceId : null,
            is_string($ip) && filter_var($ip, FILTER_VALIDATE_IP) !== false ? $ip : null,
        );
    }
}
