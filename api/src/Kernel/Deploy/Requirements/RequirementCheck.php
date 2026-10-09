<?php

declare(strict_types=1);

namespace Soltec\Kernel\Deploy\Requirements;

/** The result of one requirement. "hint" says what the person setting up the server has to do. */
final class RequirementCheck
{
    public function __construct(
        public readonly string $id,
        public readonly string $group,
        public readonly CheckStatus $status,
        public readonly string $message,
        public readonly ?string $hint = null,
    ) {
    }

    public static function pass(string $id, string $group, string $message): self
    {
        return new self($id, $group, CheckStatus::Pass, $message);
    }

    /** @return array{id: string, group: string, status: string, message: string, hint: string|null} */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'group' => $this->group,
            'status' => $this->status->value,
            'message' => $this->message,
            'hint' => $this->hint,
        ];
    }
}
