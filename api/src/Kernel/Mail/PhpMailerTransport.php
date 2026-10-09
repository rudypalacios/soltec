<?php

declare(strict_types=1);

namespace Soltec\Kernel\Mail;

use PHPMailer\PHPMailer\Exception as PhpMailerException;
use PHPMailer\PHPMailer\PHPMailer;
use Soltec\Kernel\Config;

/** Sends through PHPMailer: authenticated SMTP (recommended) or the server's mail() as plan B (ADR-0013). */
final class PhpMailerTransport implements MailTransport
{
    private const TIMEOUT_SECONDS = 20;

    public function __construct(private readonly Config $config)
    {
    }

    public function send(MailMessage $message): void
    {
        $settings = MailSettings::fromConfig($this->config);
        $mailer = new PHPMailer(true);

        try {
            $mailer->CharSet = PHPMailer::CHARSET_UTF8;
            $this->configureDriver($mailer, $settings);
            // The sender must be a real mailbox of the authenticated domain: providers rewrite it otherwise.
            $mailer->setFrom($settings->fromAddress, $settings->fromName);
            if ($settings->replyTo !== null) {
                $mailer->addReplyTo($settings->replyTo);
            }
            $mailer->addAddress($message->to);
            $mailer->isHTML(false);
            $mailer->Subject = $message->subject;
            $mailer->Body = $message->body;
            $mailer->send();
        } catch (PhpMailerException $error) {
            // errorMessage() is PHPMailer's own text (for example "SMTP Error: Could not authenticate.").
            throw new MailException($error->errorMessage(), 0, $error);
        }
    }

    public function verify(): void
    {
        $settings = MailSettings::fromConfig($this->config);
        if ($settings->driver !== MailSettings::DRIVER_SMTP) {
            return;
        }

        $mailer = new PHPMailer(true);
        try {
            $this->configureDriver($mailer, $settings);
            $mailer->smtpConnect();
        } catch (PhpMailerException $error) {
            throw new MailException($error->errorMessage(), 0, $error);
        } finally {
            $mailer->smtpClose();
        }
    }

    public function driver(): string
    {
        return MailSettings::fromConfig($this->config)->driver;
    }

    private function configureDriver(PHPMailer $mailer, MailSettings $settings): void
    {
        if ($settings->driver === MailSettings::DRIVER_MAIL) {
            $mailer->isMail();

            return;
        }

        $mailer->isSMTP();
        $mailer->Host = $settings->host;
        $mailer->Port = $settings->port;
        $mailer->SMTPAuth = true;
        $mailer->Username = $settings->username;
        $mailer->Password = $settings->password;
        $mailer->Timeout = self::TIMEOUT_SECONDS;
        $mailer->SMTPSecure = match ($settings->encryption) {
            'ssl' => PHPMailer::ENCRYPTION_SMTPS,
            'tls' => PHPMailer::ENCRYPTION_STARTTLS,
            default => '',
        };
        $mailer->SMTPAutoTLS = $settings->encryption !== 'none';
    }
}
