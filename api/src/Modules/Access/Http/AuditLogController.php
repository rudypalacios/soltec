<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Domain\AuditCursor;
use Soltec\Modules\Access\Domain\AuditFilter;
use Soltec\Modules\Access\Persistence\AuditLogRepository;

/** GET /v1/audit-logs: the only route over the audit log, and it only reads. */
final class AuditLogController
{
    use CurrentUserAware;

    public function __construct(private readonly AuditLogRepository $log)
    {
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $filter = new AuditFilter(
            $query->nullableUuid('user_id'),
            $query->nullableText('entity_type', 50),
            $query->nullableUuid('entity_id'),
            $query->nullableText('action', 50),
            $query->timestamp('from'),
            $query->timestamp('to'),
        );
        $limit = $query->limit();
        $token = $query->nullableText('cursor', 200);
        $after = $token === null || $token === '' ? null : AuditCursor::decode($token);
        if ($token !== null && $token !== '' && $after === null) {
            $query->fail('cursor', 'invalid');
        }
        if ($filter->from !== null && $filter->to !== null && $filter->from > $filter->to) {
            $query->fail('to', 'out_of_range');
        }
        $query->done();

        $page = $this->log->search($this->caller($request), $filter, $after, $limit);

        return Json::write($response, [
            'data' => $page['entries'],
            'meta' => ['limit' => $limit, 'next_cursor' => $page['next']?->encode()],
        ]);
    }
}
