<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/** A numbering rule and the state of its counter. */
final class SequenceRecord
{
    public function __construct(
        public readonly string $code,
        public readonly string $name,
        public readonly string $prefix,
        public readonly int $padding,
        public readonly string $period,
        public readonly ?string $periodKey,
        public readonly int $nextValue,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $updatedAt,
        public readonly int $version,
    ) {
    }

    /**
     * Once a number was issued the period cannot change: going back to "none" would restart the counter under
     * numbers that already exist.
     */
    public function hasIssuedNumbers(): bool
    {
        return $this->nextValue > 1 || $this->periodKey !== null;
    }

    /**
     * The number the next document will get, without reserving it. When the period has rolled over since the last
     * number, the counter starts again at 1.
     *
     * @param DateTimeImmutable $localNow the current moment in the company's time zone
     */
    public function example(DateTimeImmutable $localNow): string
    {
        $key = SequenceFormat::periodKey($this->period, $localNow);
        // A counter not yet bound to a period (nothing issued) keeps the value the administrator set.
        $rolledOver = $key !== null && $this->periodKey !== null && $key !== $this->periodKey;
        $value = $rolledOver ? 1 : $this->nextValue;

        return SequenceFormat::format($this->prefix, $this->padding, $key, $value);
    }

    /** @return array<string, mixed> the `Sequence` schema of the contract */
    public function toApi(DateTimeImmutable $localNow): array
    {
        return [
            'code' => $this->code,
            'name' => $this->name,
            'prefix' => $this->prefix,
            'padding' => $this->padding,
            'period' => $this->period,
            'next_value' => $this->nextValue,
            'period_locked' => $this->hasIssuedNumbers(),
            'example' => $this->example($localNow),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
    }
}
