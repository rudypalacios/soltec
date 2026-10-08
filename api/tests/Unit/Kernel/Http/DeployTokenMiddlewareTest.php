<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel\Http;

use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;
use Soltec\Kernel\Config;
use Soltec\Kernel\Http\DeployTokenMiddleware;
use Soltec\Kernel\Http\ProblemResponder;

final class DeployTokenMiddlewareTest extends TestCase
{
    private const TOKEN = 'a-deploy-token-with-more-than-32-characters';

    public function testIsDisabledWhenNoTokenIsConfigured(): void
    {
        $response = $this->process(new Config([]), self::TOKEN);

        self::assertSame(503, $response->getStatusCode());
        self::assertSame('deploy_token_not_configured', $this->code($response));
    }

    public function testIsDisabledWhenTheConfiguredTokenIsTooShort(): void
    {
        $response = $this->process(new Config(['DEPLOY_TOKEN' => 'short']), 'short');

        self::assertSame(503, $response->getStatusCode());
        self::assertSame('deploy_token_too_short', $this->code($response));
    }

    public function testRejectsAMissingToken(): void
    {
        $response = $this->process(new Config(['DEPLOY_TOKEN' => self::TOKEN]), null);

        self::assertSame(401, $response->getStatusCode());
        self::assertSame('unauthorized', $this->code($response));
    }

    public function testRejectsAWrongToken(): void
    {
        $response = $this->process(new Config(['DEPLOY_TOKEN' => self::TOKEN]), self::TOKEN . 'x');

        self::assertSame(401, $response->getStatusCode());
    }

    public function testLetsTheRequestThroughWithTheRightToken(): void
    {
        $response = $this->process(new Config(['DEPLOY_TOKEN' => self::TOKEN]), self::TOKEN);

        self::assertSame(204, $response->getStatusCode());
    }

    private function process(Config $config, ?string $providedToken): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest('POST', '/system/migrations/apply');
        if ($providedToken !== null) {
            $request = $request->withHeader(DeployTokenMiddleware::HEADER, $providedToken);
        }

        $middleware = new DeployTokenMiddleware($config, new ProblemResponder(new ResponseFactory()));
        $next = new class implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                return (new ResponseFactory())->createResponse(204);
            }
        };

        return $middleware->process($request, $next);
    }

    private function code(ResponseInterface $response): string
    {
        $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($body);
        self::assertIsString($body['code']);

        return $body['code'];
    }
}
