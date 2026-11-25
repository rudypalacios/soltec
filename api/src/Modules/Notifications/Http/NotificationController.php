<?php

declare(strict_types=1);

namespace Soltec\Modules\Notifications\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Modules\Access\Http\CurrentUserAware;
use Soltec\Modules\Notifications\Application\NotificationService;
use Soltec\Modules\Notifications\Domain\NotificationRecord;

/** /v1/notifications and /v1/updates: always the caller's own notices, so no permission is needed. */
final class NotificationController
{
    use CurrentUserAware;

    public function __construct(private readonly NotificationService $notifications)
    {
    }

    /** GET /v1/notifications */
    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $unreadOnly = $query->choice('unread', ['true', 'false'], 'false') === 'true';
        $before = $query->nullableUuid('before');
        $limit = $query->limit(25, 100);
        $query->done();

        $page = $this->notifications->list($this->caller($request), $unreadOnly, $before, $limit);

        return Json::write($response, [
            'data' => array_map(static fn (NotificationRecord $notice): array => $notice->toApi(), $page['records']),
            'meta' => ['limit' => $limit, 'next_cursor' => $page['next'], 'unread_count' => $page['unread']],
        ]);
    }

    /**
     * POST /v1/notifications/{notificationId}/read
     *
     * @param array<string, string> $args
     */
    public function read(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $notice = $this->notifications->markRead($this->caller($request), $args['notificationId']);

        return Json::write($response, $notice->toApi());
    }

    /** POST /v1/notifications/read-all */
    public function readAll(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, ['marked' => $this->notifications->markAllRead($this->caller($request))]);
    }

    /** GET /v1/updates: what the web polls every minute. */
    public function updates(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Input::query($request);
        $since = $query->timestamp('since');
        $query->done();

        $updates = $this->notifications->updates($this->caller($request), $since);

        return Json::write($response, [
            'unread_count' => $updates['unread_count'],
            'new_count' => $updates['new_count'],
            'server_time' => Timestamps::toIso($updates['server_time']),
        ]);
    }
}
