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

    /**
     * Connects and authenticates against the mail server without sending anything. The "mail" driver has
     * no connection to verify and returns at once.
     *
     * @throws MailException when the server cannot be reached or refuses the credentials
     * @throws \Soltec\Kernel\ConfigurationException when the MAIL_* settings are missing or invalid
     */
    public function verify(): void;

    /** Name of the active driver ("smtp" or "mail"), for diagnostics. */
    public function driver(): string;
}
