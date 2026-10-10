<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Application;

use Doctrine\DBAL\Connection;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Http\ApiException;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Persistence\AuditLogger;
use Soltec\Modules\Settings\Domain\CompanyRecord;
use Soltec\Modules\Settings\Persistence\CompanyRepository;
use Throwable;

/** The company's data and logo. Every change is audited; the logo's bytes never are, only its version. */
final class CompanyService
{
    private const ENTITY = 'company';

    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly CompanyRepository $company,
        private readonly LogoStorage $logos,
        private readonly AuditLogger $audit,
    ) {
    }

    public function get(): CompanyRecord
    {
        return $this->company->get();
    }

    /** @throws ApiException 409 `conflict` when the version is stale */
    public function update(
        ActorContext $actor,
        int $version,
        string $legalName,
        string $tradeName,
        string $taxId,
        ?string $address,
        ?string $phone,
        ?string $email,
        string $timezone,
    ): CompanyRecord {
        $this->connection->transactional(function () use (
            $actor,
            $version,
            $legalName,
            $tradeName,
            $taxId,
            $address,
            $phone,
            $email,
            $timezone,
        ): void {
            $current = $this->company->get(lock: true);
            if ($current->version !== $version) {
                throw ApiException::conflict();
            }

            $next = new CompanyRecord(
                $current->id,
                $legalName,
                $tradeName,
                $taxId,
                $address,
                $phone,
                $email,
                $timezone,
                $current->logoPath,
                $current->createdAt,
                $current->updatedAt,
                $current->version,
            );
            $before = $current->auditData();
            $changed = array_keys(array_diff_assoc($next->auditData(), $before));
            if ($changed === []) {
                return;
            }

            $this->company->update($next, $version, $this->clock->now());
            $this->audit->record(
                $actor,
                'update',
                self::ENTITY,
                $current->id,
                array_intersect_key($before, array_flip($changed)),
                array_intersect_key($next->auditData(), array_flip($changed)),
            );
        });

        return $this->company->get();
    }

    /** Replaces the logo with the uploaded image, normalised by {@see LogoImage}. */
    public function setLogo(ActorContext $actor, string $upload): CompanyRecord
    {
        $path = $this->logos->store(LogoImage::toWebp($upload));
        try {
            $previous = $this->connection->transactional(function () use ($actor, $path): ?string {
                $current = $this->company->get(lock: true);
                if ($current->logoPath === $path) {
                    return null;
                }
                $this->company->setLogoPath($path, $this->clock->now());
                $this->audit->record(
                    $actor,
                    'update',
                    self::ENTITY,
                    $current->id,
                    ['logo_version' => $current->logoVersion()],
                    ['logo_version' => pathinfo($path, PATHINFO_FILENAME)],
                );

                return $current->logoPath;
            });
        } catch (Throwable $failure) {
            // The file is only worth keeping if some row points at it.
            if ($this->company->get()->logoPath !== $path) {
                $this->logos->delete($path);
            }
            throw $failure;
        }

        if ($previous !== null) {
            $this->logos->delete($previous);
        }

        return $this->company->get();
    }

    /** Idempotent. */
    public function removeLogo(ActorContext $actor): CompanyRecord
    {
        $previous = $this->connection->transactional(function () use ($actor): ?string {
            $current = $this->company->get(lock: true);
            if ($current->logoPath === null) {
                return null;
            }
            $this->company->setLogoPath(null, $this->clock->now());
            $this->audit->record(
                $actor,
                'update',
                self::ENTITY,
                $current->id,
                ['logo_version' => $current->logoVersion()],
                ['logo_version' => null],
            );

            return $current->logoPath;
        });

        if ($previous !== null) {
            $this->logos->delete($previous);
        }

        return $this->company->get();
    }

    /** @return array{content: string, version: string}|null null when the company has no logo (or its file is gone) */
    public function logo(): ?array
    {
        $company = $this->company->get();
        $content = $company->logoPath === null ? null : $this->logos->read($company->logoPath);

        return $content === null ? null : ['content' => $content, 'version' => (string) $company->logoVersion()];
    }
}
