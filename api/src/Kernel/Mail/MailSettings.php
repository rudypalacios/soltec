<?php

declare(strict_types=1);

namespace Soltec\Kernel\Mail;

use Soltec\Kernel\Config;
use Soltec\Kernel\ConfigurationException;

/**
 * Mail settings read from the .env file (ADR-0013). They are validated when a message is sent, not at
 * startup, so a server without them only loses the mail feature.
 */
final class MailSettings
{
    public const DRIVER_SMTP = 'smtp';
    public const DRIVER_MAIL = 'mail';

    public function __construct(
        public readonly string $driver,
        public readonly string $fromAddress,
        public readonly string $fromName,
        public readonly ?string $replyTo,
        public readonly string $host,
        public readonly int $port,
        public readonly string $encryption,
        public readonly string $username,
        public readonly string $password,
    ) {
    }

    public static function fromConfig(Config $config): self
    {
        $driver = $config->string('MAIL_DRIVER', self::DRIVER_SMTP);
        if (!in_array($driver, [self::DRIVER_SMTP, self::DRIVER_MAIL], true)) {
            throw ConfigurationException::invalid('MAIL_DRIVER', 'use "smtp" or "mail".');
        }

        $fromAddress = $config->string('MAIL_FROM_ADDRESS');
        self::assertAddress('MAIL_FROM_ADDRESS', $fromAddress);
        $replyTo = $config->optionalString('MAIL_REPLY_TO');
        if ($replyTo !== null) {
            self::assertAddress('MAIL_REPLY_TO', $replyTo);
        }
        $fromName = $config->string('MAIL_FROM_NAME', 'Soltec');
        if (preg_match('/[\r\n]/', $fromName) === 1) {
            throw ConfigurationException::invalid('MAIL_FROM_NAME', 'it must be a single line.');
        }

        // Credentials only matter for SMTP; the mail() driver hands over to the server's own MTA.
        $smtp = $driver === self::DRIVER_SMTP;
        $encryption = $config->string('MAIL_ENCRYPTION', 'ssl');
        if (!in_array($encryption, ['ssl', 'tls', 'none'], true)) {
            throw ConfigurationException::invalid('MAIL_ENCRYPTION', 'use "ssl", "tls" or "none".');
        }

        return new self(
            $driver,
            $fromAddress,
            $fromName,
            $replyTo,
            $smtp ? $config->string('MAIL_HOST') : '',
            $smtp ? $config->int('MAIL_PORT', $encryption === 'tls' ? 587 : 465) : 0,
            $encryption,
            $smtp ? $config->string('MAIL_USERNAME') : '',
            $smtp ? $config->string('MAIL_PASSWORD') : '',
        );
    }

    private static function assertAddress(string $key, string $value): void
    {
        if (filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
            throw ConfigurationException::invalid($key, 'it must be an email address.');
        }
    }
}
