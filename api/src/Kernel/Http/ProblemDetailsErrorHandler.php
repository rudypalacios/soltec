<?php

declare(strict_types=1);

namespace Soltec\Kernel\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;
use Slim\Exception\HttpException;
use Slim\Exception\HttpMethodNotAllowedException;
use Slim\Interfaces\ErrorHandlerInterface;
use Soltec\Kernel\Config;
use Throwable;

/** Turns every uncaught exception into a problem-details response and logs the unexpected ones. */
final class ProblemDetailsErrorHandler implements ErrorHandlerInterface
{
    private const HTTP_ERRORS = [
        400 => ['bad_request', 'Bad request'],
        401 => ['unauthorized', 'Unauthorized'],
        403 => ['forbidden', 'Forbidden'],
        404 => ['not_found', 'Not found'],
        405 => ['method_not_allowed', 'Method not allowed'],
    ];

    public function __construct(
        private readonly ProblemResponder $problems,
        private readonly LoggerInterface $logger,
        private readonly Config $config,
    ) {
    }

    public function __invoke(
        ServerRequestInterface $request,
        Throwable $exception,
        bool $displayErrorDetails,
        bool $logErrors,
        bool $logErrorDetails,
    ): ResponseInterface {
        if ($exception instanceof HttpException) {
            return $this->httpError($exception);
        }

        $this->logger->error($exception->getMessage(), ['exception' => $exception]);

        return $this->problems->respond(
            500,
            'internal_error',
            'Internal server error',
            $this->config->isDebug() ? $exception->getMessage() : null,
        );
    }

    private function httpError(HttpException $exception): ResponseInterface
    {
        $status = $exception->getCode();
        [$code, $title] = self::HTTP_ERRORS[$status] ?? ['http_error', 'HTTP error'];
        $response = $this->problems->respond($status, $code, $title);

        if ($exception instanceof HttpMethodNotAllowedException) {
            $response = $response->withHeader('Allow', implode(', ', $exception->getAllowedMethods()));
        }

        return $response;
    }
}
