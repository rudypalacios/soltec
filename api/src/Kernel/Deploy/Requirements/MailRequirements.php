<?php

declare(strict_types=1);

namespace Soltec\Kernel\Deploy\Requirements;

use Soltec\Kernel\Config;
use Soltec\Kernel\ConfigurationException;
use Soltec\Kernel\Mail\MailException;
use Soltec\Kernel\Mail\MailSettings;
use Soltec\Kernel\Mail\MailTransport;

/**
 * Mail requirements: the MAIL_* settings are valid and the SMTP server accepts the credentials.
 * Nothing is sent; delivery to Gmail and Outlook is checked with the "Mail test" workflow.
 */
final class MailRequirements
{
    public function __construct(
        private readonly Config $config,
        private readonly MailTransport $mail,
    ) {
    }

    /** @return list<RequirementCheck> */
    public function checks(): array
    {
        try {
            $settings = MailSettings::fromConfig($this->config);
        } catch (ConfigurationException $error) {
            // Not fatal for the system today, but password recovery needs it from milestone 1.
            return [new RequirementCheck(
                'mail.settings',
                'mail',
                CheckStatus::Warn,
                $error->getMessage(),
                'Create the mailbox in cPanel and add the MAIL_* settings (docs/despliegue.md, section 2.4).',
            )];
        }

        $settingsCheck = RequirementCheck::pass(
            'mail.settings',
            'mail',
            sprintf('Driver %s, sender %s', $settings->driver, $settings->fromAddress),
        );

        if ($settings->driver !== MailSettings::DRIVER_SMTP) {
            return [$settingsCheck, new RequirementCheck(
                'mail.smtp',
                'mail',
                CheckStatus::Warn,
                'The mail() driver gives no delivery confirmation or bounces.',
                'Use MAIL_DRIVER=smtp with a dedicated mailbox (ADR-0013).',
            )];
        }

        try {
            $this->mail->verify();
        } catch (MailException $error) {
            return [$settingsCheck, new RequirementCheck(
                'mail.smtp',
                'mail',
                CheckStatus::Fail,
                'The SMTP server did not accept the connection: ' . $error->getMessage(),
                'Check MAIL_HOST, MAIL_PORT, MAIL_ENCRYPTION, MAIL_USERNAME and MAIL_PASSWORD.',
            )];
        }

        return [$settingsCheck, RequirementCheck::pass(
            'mail.smtp',
            'mail',
            sprintf('Connected and authenticated to %s:%d', $settings->host, $settings->port),
        )];
    }
}
