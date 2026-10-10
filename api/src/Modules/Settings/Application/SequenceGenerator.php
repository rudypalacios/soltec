<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Application;

use DateTimeZone;
use Doctrine\DBAL\Connection;
use LogicException;
use Soltec\Kernel\Clock;
use Soltec\Modules\Settings\Domain\SequenceFormat;
use Soltec\Modules\Settings\Persistence\CompanyRepository;
use Soltec\Modules\Settings\Persistence\SequenceRepository;

/**
 * Issues document numbers (projects, quotes, purchase orders...): unique even with simultaneous requests, and
 * without gaps, because the number is taken inside the transaction that creates the document and a rollback gives
 * it back. The price is that issuing numbers of the same kind queues up until each transaction ends, so call
 * {@see next()} as late as possible in the transaction.
 */
final class SequenceGenerator
{
    public function __construct(
        private readonly Connection $connection,
        private readonly Clock $clock,
        private readonly SequenceRepository $sequences,
        private readonly CompanyRepository $company,
    ) {
    }

    /**
     * @return string the formatted number, for example `COT-2610-0001`
     * @throws LogicException outside a transaction, or for a code no migration created
     */
    public function next(string $code): string
    {
        if (!$this->connection->isTransactionActive()) {
            throw new LogicException('A document number must be taken inside the transaction that saves the document.');
        }

        // The period follows the company's calendar, not the server's UTC.
        $local = $this->clock->now()->setTimezone(new DateTimeZone($this->company->get()->timezone));
        $taken = $this->sequences->take(
            $code,
            (string) SequenceFormat::periodKey(SequenceFormat::YEAR, $local),
            (string) SequenceFormat::periodKey(SequenceFormat::MONTH, $local),
        ) ?? throw new LogicException(sprintf('Unknown sequence "%s".', $code));

        $rule = $this->sequences->find($code) ?? throw new LogicException(sprintf('Unknown sequence "%s".', $code));

        return SequenceFormat::format($rule->prefix, $rule->padding, $taken['period_key'], $taken['value']);
    }
}
