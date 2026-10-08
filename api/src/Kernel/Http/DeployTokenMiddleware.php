<?php

declare(strict_types=1);

namespace Soltec\Kernel\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Soltec\Kernel\Config;

/**
 * Protects the deployment endpoints (migrations, diagnostics) with a shared secret.
 *
 * The endpoints are disabled while DEPLOY_TOKEN is missing or too short, so a server that was
 * never configured cannot be driven by anyone (see ADR-0003).
 */
final class DeployTokenMiddleware implements MiddlewareInterface
{
    public const HEADER = 'X-Deploy-Token';
    public const MINIMUM_LENGTH = 32;

    public function __construct(
        private readonly Config $config,
        private readonly ProblemResponder $problems,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $expected = $this->config->optionalString('DEPLOY_TOKEN');

        if ($expected === null) {
            return $this->problems->respond(
                503,
                'deploy_token_not_configured',
                'Deployment endpoints are disabled',
                'Set DEPLOY_TOKEN in the .env file of this instance.',
            );
        }

        if (strlen($expected) < self::MINIMUM_LENGTH) {
            return $this->problems->respond(
                503,
                'deploy_token_too_short',
                'Deployment endpoints are disabled',
                sprintf('DEPLOY_TOKEN must have at least %d characters.', self::MINIMUM_LENGTH),
            );
        }

        $provided = $request->getHeaderLine(self::HEADER);

        if ($provided === '' || !hash_equals($expected, $provided)) {
            return $this->problems->respond(
                401,
                'unauthorized',
                'Unauthorized',
                sprintf('A valid %s header is required.', self::HEADER),
            );
        }

        return $handler->handle($request);
    }
}
