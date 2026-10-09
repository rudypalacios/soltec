<?php

declare(strict_types=1);

namespace Soltec\Kernel\Http\Controller;

use DateTimeImmutable;
use InvalidArgumentException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;
use Soltec\Kernel\Config;
use Soltec\Kernel\ConfigurationException;
use Soltec\Kernel\Http\Json;
use Soltec\Kernel\Http\ProblemResponder;
use Soltec\Kernel\Mail\MailException;
use Soltec\Kernel\Mail\MailMessage;
use Soltec\Kernel\Mail\MailTransport;

/**
 * Sends a test message to verify delivery on the real server (Gmail, Outlook). It is separate from
 * DeployController so a server without MAIL_* settings still migrates and deploys.
 */
final class MailTestController
{
    public function __construct(
        private readonly MailTransport $mail,
        private readonly Config $config,
        private readonly ProblemResponder $problems,
        private readonly LoggerInterface $logger,
    ) {
    }

    /** POST /system/mail/test with {"to": "address"} */
    public function send(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body = $request->getParsedBody();
        $to = is_array($body) && is_string($body['to'] ?? null) ? $body['to'] : '';

        try {
            $message = new MailMessage($to, 'Prueba de correo de Soltec', $this->body());
        } catch (InvalidArgumentException $error) {
            return $this->problems->respond(422, 'invalid_recipient', 'Invalid recipient', $error->getMessage());
        }

        try {
            $this->mail->send($message);
        } catch (ConfigurationException $error) {
            return $this->problems->respond(
                503,
                'mail_not_configured',
                'Mail is not configured',
                $error->getMessage(),
            );
        } catch (MailException $error) {
            $this->logger->error('Test mail failed.', ['exception' => $error]);

            // Protected by the deploy token, so the server's reason is shown to whoever is verifying delivery.
            return $this->problems->respond(
                502,
                'mail_send_failed',
                'The mail server refused the message',
                $error->getMessage(),
            );
        }

        return Json::write($response, ['sent' => true, 'driver' => $this->mail->driver()]);
    }

    private function body(): string
    {
        return sprintf(
            "Este es un correo de prueba de Soltec.\n\nEntorno: %s\nFecha: %s\n\n"
            . "Si lo lees en la bandeja de entrada (no en spam), la entrega funciona.\n"
            . "Revisa en el origen del mensaje que SPF, DKIM y DMARC aparezcan como PASS.\n",
            $this->config->optionalString('APP_ENV') ?? 'unknown',
            (new DateTimeImmutable())->format('Y-m-d H:i:s T'),
        );
    }
}
