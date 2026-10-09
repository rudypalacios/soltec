<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel\Mail;

use PHPUnit\Framework\TestCase;
use Soltec\Kernel\Config;
use Soltec\Kernel\ConfigurationException;
use Soltec\Kernel\Mail\MailSettings;

final class MailSettingsTest extends TestCase
{
    private const SMTP = [
        'MAIL_HOST' => 'mail.example.com',
        'MAIL_USERNAME' => 'noreply@example.com',
        'MAIL_PASSWORD' => 'secret',
        'MAIL_FROM_ADDRESS' => 'noreply@example.com',
    ];

    public function testReadsSmtpSettingsWithDefaults(): void
    {
        $settings = MailSettings::fromConfig(new Config(self::SMTP));

        self::assertSame('smtp', $settings->driver);
        self::assertSame(465, $settings->port);
        self::assertSame('ssl', $settings->encryption);
        self::assertSame('Soltec', $settings->fromName);
        self::assertNull($settings->replyTo);
    }

    public function testTlsDefaultsToTheSubmissionPort(): void
    {
        $settings = MailSettings::fromConfig(new Config(['MAIL_ENCRYPTION' => 'tls'] + self::SMTP));

        self::assertSame(587, $settings->port);
    }

    public function testTheMailDriverDoesNotNeedCredentials(): void
    {
        $settings = MailSettings::fromConfig(new Config([
            'MAIL_DRIVER' => 'mail',
            'MAIL_FROM_ADDRESS' => 'noreply@example.com',
        ]));

        self::assertSame('mail', $settings->driver);
        self::assertSame('', $settings->host);
    }

    public function testFailsLoudlyWhenSmtpCredentialsAreMissing(): void
    {
        $this->expectException(ConfigurationException::class);
        $this->expectExceptionMessage('"MAIL_PASSWORD"');

        MailSettings::fromConfig(new Config(array_diff_key(self::SMTP, ['MAIL_PASSWORD' => 1])));
    }

    public function testRejectsAnUnknownDriver(): void
    {
        $this->expectException(ConfigurationException::class);
        $this->expectExceptionMessage('"MAIL_DRIVER"');

        MailSettings::fromConfig(new Config(['MAIL_DRIVER' => 'sendmail'] + self::SMTP));
    }

    public function testRejectsAnInvalidSenderAddress(): void
    {
        $this->expectException(ConfigurationException::class);
        $this->expectExceptionMessage('"MAIL_FROM_ADDRESS"');

        MailSettings::fromConfig(new Config(['MAIL_FROM_ADDRESS' => 'nobody'] + self::SMTP));
    }

    public function testRejectsASenderNameThatSpansLines(): void
    {
        $this->expectException(ConfigurationException::class);
        $this->expectExceptionMessage('"MAIL_FROM_NAME"');

        MailSettings::fromConfig(new Config(['MAIL_FROM_NAME' => "A\nBcc: x@example.com"] + self::SMTP));
    }
}
