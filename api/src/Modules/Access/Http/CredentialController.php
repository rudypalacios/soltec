<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Input;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Application\CredentialService;

/** The public routes of the email links: POST /v1/auth/invitations/accept, /password/forgot and /password/reset. */
final class CredentialController
{
    /** Tokens are 32 random bytes in hex; anything else is rejected before touching the database. */
    private const TOKEN_LENGTH = 64;

    public function __construct(private readonly CredentialService $credentials)
    {
    }

    public function acceptInvitation(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $token = $this->token($input);
        $password = $input->secret('password');
        $input->done();

        $this->credentials->acceptInvitation((string) $token, (string) $password);

        return $response->withStatus(204);
    }

    public function forgotPassword(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $email = $input->email('email');
        $input->done();

        $this->credentials->requestPasswordReset((string) $email, ActorContext::fromRequest($request));

        return $response->withStatus(204);
    }

    public function resetPassword(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $token = $this->token($input);
        $password = $input->secret('password');
        $input->done();

        $this->credentials->resetPassword((string) $token, (string) $password);

        return $response->withStatus(204);
    }

    private function token(Input $input): ?string
    {
        $token = $input->text('token', self::TOKEN_LENGTH, self::TOKEN_LENGTH);

        if ($token !== null && preg_match('/^[0-9a-f]{64}$/', $token) !== 1) {
            $input->fail('token', 'invalid');

            return null;
        }

        return $token;
    }
}
