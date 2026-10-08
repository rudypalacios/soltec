<?php

declare(strict_types=1);

namespace Soltec\Kernel;

/**
 * Resolves where things live, both in the repository (development) and in the deployed layout
 * (see docs/arquitectura/estructura-del-repositorio.md, section 5).
 *
 * Deployed layout: <instance root>/{public, api, db, storage, .env}.
 * Repository layout: <repo>/{api, db} with the storage and .env inside api/.
 */
final class Paths
{
    private readonly string $appRoot;

    public function __construct(string $appRoot)
    {
        $this->appRoot = rtrim($appRoot, '/');
    }

    public function appRoot(): string
    {
        return $this->appRoot;
    }

    public function instanceRoot(): string
    {
        return dirname($this->appRoot);
    }

    /** The deployed layout is recognised by the "public" directory sitting next to "api". */
    public function isDeployed(): bool
    {
        return is_dir($this->instanceRoot() . '/public');
    }

    /** Directory that holds the ".env" file. */
    public function envDirectory(): string
    {
        return $this->isDeployed() ? $this->instanceRoot() : $this->appRoot;
    }

    public function storageDirectory(): string
    {
        return $this->envDirectory() . '/storage';
    }

    public function migrationsDirectory(): string
    {
        return $this->instanceRoot() . '/db/migrations';
    }
}
