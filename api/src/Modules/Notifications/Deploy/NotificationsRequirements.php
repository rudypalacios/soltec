<?php

declare(strict_types=1);

namespace Soltec\Modules\Notifications\Deploy;

use DateTimeImmutable;
use DateTimeZone;
use Doctrine\DBAL\Exception as DbalException;
use LogicException;
use Soltec\Kernel\Config;
use Soltec\Kernel\ConfigurationException;
use Soltec\Kernel\Db\ConnectionFactory;
use Soltec\Kernel\Deploy\Requirements\CheckStatus;
use Soltec\Kernel\Deploy\Requirements\ModuleRequirements;
use Soltec\Kernel\Deploy\Requirements\RequirementCheck;
use Soltec\Modules\Notifications\Persistence\NotificationSettingsRepository;

/**
 * The hourly job of the hosting must be set up: without it every notice still works except the due-date reminders.
 * It is a warning, not a failure, so a new instance can be deployed before the cron line exists.
 */
final class NotificationsRequirements implements ModuleRequirements
{
    private const MAX_SILENCE_HOURS = 2;

    public function __construct(private readonly Config $config)
    {
    }

    /** @return list<RequirementCheck> */
    public function checks(): array
    {
        try {
            $settings = (new NotificationSettingsRepository(ConnectionFactory::create($this->config)))->get();
        } catch (ConfigurationException | DbalException | LogicException) {
            // No database, or the migration did not run yet: the database checks already say so.
            return [];
        }

        $hint = 'Add a cron job in cPanel that runs "php api/bin/console notifications:run" every hour '
            . '(docs/despliegue.md, 2.7).';
        if ($settings->lastRunAt === null) {
            return [new RequirementCheck(
                'notifications.cron',
                'notifications',
                CheckStatus::Warn,
                'The notifications job has never run: the due-date reminders and the pending emails are not sent.',
                $hint,
            )];
        }

        $silence = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->getTimestamp()
            - $settings->lastRunAt->getTimestamp();
        if ($silence > self::MAX_SILENCE_HOURS * 3600) {
            return [new RequirementCheck(
                'notifications.cron',
                'notifications',
                CheckStatus::Warn,
                sprintf('The notifications job last ran %d hours ago.', intdiv($silence, 3600)),
                $hint,
            )];
        }

        return [RequirementCheck::pass('notifications.cron', 'notifications', 'The notifications job runs every hour')];
    }
}
