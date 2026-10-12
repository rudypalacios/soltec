<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Domain;

use DateTimeImmutable;
use Soltec\Kernel\Db\Timestamps;

/** A role with its permission matrix and data scopes. */
final class RoleRecord
{
    /**
     * @param array<string, list<string>> $permissions actions by resource code
     * @param array<string, string> $scopes `own`, `team` or `all` by resource code
     * @param list<string> $widgets codes of the home screen widgets, in the order they show
     */
    public function __construct(
        public readonly string $id,
        public readonly ?string $code,
        public readonly string $name,
        public readonly ?string $description,
        public readonly string $userType,
        public readonly bool $isSystem,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $updatedAt,
        public readonly int $version,
        public readonly ?DateTimeImmutable $deletedAt,
        public readonly array $permissions = [],
        public readonly array $scopes = [],
        public readonly array $widgets = [],
    ) {
    }

    /**
     * @param array<string, list<string>> $permissions
     * @param array<string, string> $scopes
     * @param list<string> $widgets
     */
    public function withMatrix(array $permissions, array $scopes, array $widgets): self
    {
        return new self(
            $this->id,
            $this->code,
            $this->name,
            $this->description,
            $this->userType,
            $this->isSystem,
            $this->createdAt,
            $this->updatedAt,
            $this->version,
            $this->deletedAt,
            $permissions,
            $scopes,
            $widgets,
        );
    }

    /** @return array<string, mixed> the `Role` schema of the contract */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'description' => $this->description,
            'user_type' => $this->userType,
            'is_system' => $this->isSystem,
            'is_active' => $this->deletedAt === null,
            // An empty PHP array would encode as a JSON list; the contract says object.
            'permissions' => (object) $this->permissions,
            'scopes' => (object) $this->scopes,
            'widgets' => $this->widgets,
            'created_at' => Timestamps::toIso($this->createdAt),
            'updated_at' => Timestamps::toIso($this->updatedAt),
            'version' => $this->version,
        ];
    }
}
