<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Http;

use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Auth\AuthenticationMiddleware;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Uuid;

/** What the controllers of protected routes share: the signed-in user and the id in the path. */
trait CurrentUserAware
{
    private function caller(ServerRequestInterface $request): CurrentUser
    {
        $user = $request->getAttribute(AuthenticationMiddleware::USER_ATTRIBUTE);

        return $user instanceof CurrentUser ? $user : throw ApiException::unauthorized('token_invalid');
    }

    /**
     * An id that is not a UUID can never exist, so it answers 404 like any other unknown id.
     *
     * @param array<string, string> $args
     */
    private function pathId(array $args, string $name): string
    {
        $id = $args[$name] ?? '';

        return Uuid::isValid($id) ? $id : throw ApiException::notFound();
    }
}
