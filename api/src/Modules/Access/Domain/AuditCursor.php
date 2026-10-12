<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;
use Soltec\Kernel\Uuid;

/**
 * Where the previous page of the audit log ended: the moment and id of its last entry. The log is read newest first
 * and only grows, so a page is «everything older than this entry», which stays right while new entries arrive (an
 * offset would shift). It is opaque to clients; one that is altered or invented is rejected, not guessed at.
 */
final class AuditCursor
{
    public function __construct(public readonly DateTimeImmutable $occurredAt, public readonly string $id)
    {
    }

    public function encode(): string
    {
        $json = json_encode(['t' => Timestamps::toDb($this->occurredAt), 'i' => $this->id], JSON_THROW_ON_ERROR);

        return rtrim(strtr(base64_encode($json), '+/', '-_'), '=');
    }

    public static function decode(string $token): ?self
    {
        $json = base64_decode(strtr($token, '-_', '+/'), true);
        $data = $json === false ? null : json_decode($json, true);
        if (!is_array($data) || !is_string($data['t'] ?? null) || !is_string($data['i'] ?? null)) {
            return null;
        }
        $shapeOfMoment = '/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/';
        if (preg_match($shapeOfMoment, $data['t']) !== 1 || !Uuid::isValid($data['i'])) {
            return null;
        }

        return new self(Timestamps::fromDb($data['t']), $data['i']);
    }
}
