<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Application;

use Soltec\Kernel\Config;
use Soltec\Kernel\Mail\MailMessage;
use Soltec\Kernel\Mail\MailTransport;
use Soltec\Modules\Access\Domain\SecurityPolicy;

/**
 * The two emails of the credential flows. The link is built from APP_URL, never from the request (a forged Host
 * header must not point a victim to another site), and carries the token in the fragment, which browsers do not
 * send to servers or in the Referer header.
 */
final class AccountMailer
{
    public function __construct(private readonly MailTransport $mail, private readonly Config $config)
    {
    }

    /**
     * @throws \Soltec\Kernel\Mail\MailException
     * @throws \Soltec\Kernel\ConfigurationException when APP_URL or the MAIL_* settings are missing
     */
    public function sendInvitation(string $to, string $name, string $token): void
    {
        $link = $this->link('/aceptar-invitacion', $token);
        $this->mail->send(new MailMessage(
            $to,
            sprintf('Invitación a %s', $this->brand()),
            sprintf(
                "Hola %s,\n\nSe creó una cuenta para ti en %s. Para activarla y elegir tu contraseña abre este "
                . "enlace:\n\n%s\n\nEl enlace sirve una sola vez y vence en %d horas. Si no esperabas este "
                . "correo, ignóralo: sin abrir el enlace la cuenta no se activa.\n",
                $this->line($name),
                $this->brand(),
                $link,
                SecurityPolicy::INVITATION_HOURS,
            ),
        ));
    }

    /**
     * @throws \Soltec\Kernel\Mail\MailException
     * @throws \Soltec\Kernel\ConfigurationException
     */
    public function sendPasswordReset(string $to, string $name, string $token): void
    {
        $link = $this->link('/restablecer-contrasena', $token);
        $this->mail->send(new MailMessage(
            $to,
            sprintf('Restablecer tu contraseña de %s', $this->brand()),
            sprintf(
                "Hola %s,\n\nRecibimos una solicitud para restablecer tu contraseña. Abre este enlace para elegir "
                . "una nueva:\n\n%s\n\nEl enlace sirve una sola vez y vence en %d hora. Si no la pediste, ignora este "
                . "correo: tu contraseña actual sigue siendo la misma.\n",
                $this->line($name),
                $link,
                SecurityPolicy::PASSWORD_RESET_HOURS,
            ),
        ));
    }

    private function link(string $path, string $token): string
    {
        return rtrim($this->config->string('APP_URL'), '/') . $path . '#token=' . $token;
    }

    private function brand(): string
    {
        return $this->line($this->config->string('MAIL_FROM_NAME', 'Soltec'));
    }

    /** Names come from users: a line break must never reach the body structure or a header. */
    private function line(string $text): string
    {
        return trim((string) preg_replace('/\s+/', ' ', $text));
    }
}
