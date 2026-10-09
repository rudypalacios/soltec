<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel\Deploy;

use PHPUnit\Framework\TestCase;
use Soltec\Kernel\Config;
use Soltec\Kernel\Deploy\Requirements\MailRequirements;
use Soltec\Kernel\Mail\MailException;
use Soltec\Tests\Unit\Kernel\Mail\FakeMailTransport;

final class MailRequirementsTest extends TestCase
{
    private const SMTP = [
        'MAIL_HOST' => 'mail.example.com',
        'MAIL_USERNAME' => 'noreply@example.com',
        'MAIL_PASSWORD' => 'secret',
        'MAIL_FROM_ADDRESS' => 'noreply@example.com',
    ];

    public function testWarnsWhenMailIsNotConfigured(): void
    {
        $checks = $this->checks([]);

        self::assertSame(['mail.settings' => 'warn'], $checks);
    }

    public function testPassesWhenTheSmtpServerAcceptsTheCredentials(): void
    {
        self::assertSame(
            ['mail.settings' => 'pass', 'mail.smtp' => 'pass'],
            $this->checks(self::SMTP),
        );
    }

    public function testFailsWhenTheSmtpServerRefusesTheConnection(): void
    {
        $checks = $this->checks(self::SMTP, new MailException('SMTP Error: Could not authenticate.'));

        self::assertSame(['mail.settings' => 'pass', 'mail.smtp' => 'fail'], $checks);
    }

    public function testWarnsThatTheMailDriverCannotBeVerified(): void
    {
        $checks = $this->checks(['MAIL_DRIVER' => 'mail', 'MAIL_FROM_ADDRESS' => 'noreply@example.com']);

        self::assertSame(['mail.settings' => 'pass', 'mail.smtp' => 'warn'], $checks);
    }

    public function testNeverExposesTheMailPassword(): void
    {
        $requirements = new MailRequirements(new Config(self::SMTP), new FakeMailTransport());

        foreach ($requirements->checks() as $check) {
            self::assertStringNotContainsString('secret', json_encode($check->toArray(), JSON_THROW_ON_ERROR));
        }
    }

    /**
     * @param array<string, string> $settings
     * @return array<string, string> the status of each check, keyed by id
     */
    private function checks(array $settings, ?MailException $failure = null): array
    {
        $requirements = new MailRequirements(new Config($settings), new FakeMailTransport($failure));

        $statuses = [];
        foreach ($requirements->checks() as $check) {
            $statuses[$check->id] = $check->status->value;
        }

        return $statuses;
    }
}
