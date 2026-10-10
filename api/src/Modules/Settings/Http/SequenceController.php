<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Settings\Application\SequenceService;
use Soltec\Modules\Settings\Domain\SequenceFormat;

/** /v1/sequences */
final class SequenceController
{
    public function __construct(private readonly SequenceService $sequences)
    {
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, ['data' => $this->sequences->list()]);
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $code = $args['code'] ?? '';
        if (preg_match('/^[a-z_]{1,50}$/', $code) !== 1) {
            throw ApiException::notFound();
        }

        $input = Input::body($request);
        $version = $input->version();
        $prefix = $input->text('prefix', 1, 10);
        if ($prefix !== null) {
            $prefix = strtoupper($prefix);
            if (preg_match('/^[A-Z0-9]+$/', $prefix) !== 1) {
                $input->fail('prefix', 'invalid');
            }
        }
        $padding = $input->integer('padding', 1, 10);
        $period = $input->choice('period', SequenceFormat::PERIODS);
        $nextValue = $input->integer('next_value', 1, PHP_INT_MAX);
        $input->done();

        $sequence = $this->sequences->update(
            ActorContext::fromRequest($request),
            $code,
            (int) $version,
            (string) $prefix,
            (int) $padding,
            (string) $period,
            (int) $nextValue,
        );

        return Json::write($response, $sequence);
    }
}
