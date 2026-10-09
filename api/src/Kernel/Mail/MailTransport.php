<?php

declare(strict_types=1);

namespace Soltec\Kernel\Mail;

/** Sends one message. Features depend on this interface so tests can use a fake (ADR-0013). */
interface MailTransport
{
    /**
     * @throws MailException when the mail server refuses or cannot be reached
     * @throws \Soltec\Kernel\ConfigurationException when the MAIL_* settings are missing or invalid
     */
    public function send(MailMessage $message): void;

    /** Name of the active driver ("smtp" or "mail"), for diagnostics. */
    public function driver(): string;
}
