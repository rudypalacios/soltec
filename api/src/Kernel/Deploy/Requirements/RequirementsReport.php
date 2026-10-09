<?php

declare(strict_types=1);

namespace Soltec\Kernel\Deploy\Requirements;

/** The list of checks plus the verdict: "blocked" when any failed, "ready_with_warnings" or "ready". */
final class RequirementsReport
{
    /** @param list<RequirementCheck> $checks */
    public function __construct(private readonly array $checks)
    {
    }

    public function status(): string
    {
        return match (true) {
            $this->count(CheckStatus::Fail) > 0 => 'blocked',
            $this->count(CheckStatus::Warn) > 0 => 'ready_with_warnings',
            default => 'ready',
        };
    }

    /** @return array{status: string, summary: array<string, int>, checks: list<array<string, string|null>>} */
    public function toArray(): array
    {
        return [
            'status' => $this->status(),
            'summary' => [
                'pass' => $this->count(CheckStatus::Pass),
                'warn' => $this->count(CheckStatus::Warn),
                'fail' => $this->count(CheckStatus::Fail),
            ],
            'checks' => array_map(static fn (RequirementCheck $check): array => $check->toArray(), $this->checks),
        ];
    }

    private function count(CheckStatus $status): int
    {
        return count(array_filter($this->checks, static fn (RequirementCheck $c): bool => $c->status === $status));
    }
}
