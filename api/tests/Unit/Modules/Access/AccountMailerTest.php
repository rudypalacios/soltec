<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Modules\Access;

use PHPUnit\Framework\TestCase;
use Soltec\Kernel\Config;
use Soltec\Kernel\ConfigurationException;
use Soltec\Modules\Access\Application\AccountMailer;
use Soltec\Tests\Unit\Kernel\Mail\FakeMailTransport;

final class AccountMailerTest extends TestCase
{
    private const TOKEN = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

    public function testTheInvitationLinkComesFromAppUrlAndKeepsTheTokenInTheFragment(): void
    {
        $mail = new FakeMailTransport();

        $this->mailer($mail, ['APP_URL' => 'https://crm.example.test/'])
            ->sendInvitation('ana@example.com', 'Ana', self::TOKEN);

        self::assertCount(1, $mail->sent);
        self::assertSame('Invitación a Acme', $mail->sent[0]->subject);
        self::assertStringContainsString(
            "\nhttps://crm.example.test/aceptar-invitacion#token=" . self::TOKEN . "\n",
            $mail->sent[0]->body,
        );
        self::assertStringContainsString('72 horas', $mail->sent[0]->body);
    }

    public function testTheRecoveryLinkAndItsLifetime(): void
    {
        $mail = new FakeMailTransport();

        $this->mailer($mail)->sendPasswordReset('ana@example.com', 'Ana', self::TOKEN);

        self::assertStringContainsString(
            'https://app.example.test/restablecer-contrasena#token=',
            $mail->sent[0]->body,
        );
        self::assertStringContainsString('1 hora', $mail->sent[0]->body);
    }

    public function testALineBreakInANameCannotReshapeTheMessage(): void
    {
        $mail = new FakeMailTransport();

        $this->mailer($mail)->sendInvitation('ana@example.com', "Ana\n\nVisit http://evil.test", self::TOKEN);

        self::assertStringStartsWith('Hola Ana Visit http://evil.test,', $mail->sent[0]->body);
    }

    public function testWithoutAppUrlNothingIsSent(): void
    {
        $mail = new FakeMailTransport();
        $mailer = new AccountMailer($mail, new Config([]));

        $this->expectException(ConfigurationException::class);
        try {
            $mailer->sendInvitation('ana@example.com', 'Ana', self::TOKEN);
        } finally {
            self::assertSame([], $mail->sent);
        }
    }

    /** @param array<string, string> $settings */
    private function mailer(FakeMailTransport $mail, array $settings = []): AccountMailer
    {
        return new AccountMailer(
            $mail,
            new Config($settings + ['APP_URL' => 'https://app.example.test', 'MAIL_FROM_NAME' => 'Acme']),
        );
    }
}
