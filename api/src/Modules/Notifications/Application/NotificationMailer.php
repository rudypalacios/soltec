<?php

declare(strict_types=1);

namespace Soltec\Modules\Notifications\Application;

use Psr\Log\LoggerInterface;
use Soltec\Kernel\Config;
use Soltec\Kernel\Mail\MailMessage;
use Soltec\Kernel\Mail\MailTransport;
use Soltec\Modules\Notifications\Domain\NotificationType;
use Soltec\Modules\Notifications\Persistence\NotificationRepository;
use Throwable;

/**
 * Sends the email of each notice, one email per notice (the decision of the owner, 2026-11-25: if the hosting's limit
 * gets in the way, it is dealt with then). It never throws: a failure is written on the notice (`email_status`
 * `failed` and the reason) and logged, because the change that caused the notice already happened and a mail server
 * that is down must not undo it. The email says who did what and where, and carries a link; it never carries the text
 * of a comment.
 */
final class NotificationMailer
{
    private const BATCH = 200;

    /** What each kind of record is called in a sentence, and where its screen lives in the web. */
    private const SUBJECTS = [
        'task' => ['la tarea', '/tareas/'],
        'ticket' => ['el ticket', '/tickets/'],
        'client' => ['el cliente', '/clientes/'],
    ];

    public function __construct(
        private readonly NotificationRepository $notices,
        private readonly MailTransport $mail,
        private readonly Config $config,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * @param list<string>|null $ids only these notices; null for every one still pending
     * @return array{sent: int, failed: int}
     */
    public function deliver(?array $ids = null): array
    {
        $totals = ['sent' => 0, 'failed' => 0];
        foreach ($this->notices->pendingEmails($ids, self::BATCH) as $notice) {
            if (!$this->notices->claimEmail($notice['id'])) {
                continue;
            }
            try {
                $this->mail->send($this->compose($notice));
                $this->notices->markEmailSent($notice['id']);
                ++$totals['sent'];
            } catch (Throwable $error) {
                $this->notices->markEmailFailed($notice['id'], $error->getMessage());
                $this->logger->warning('A notification email could not be sent.', [
                    'notification' => $notice['id'],
                    'exception' => $error,
                ]);
                ++$totals['failed'];
            }
        }

        return $totals;
    }

    /**
     * @param array{id: string, type: NotificationType, subject_type: string, subject_id: string,
     *     subject_title: string, actor_name: string|null, data: array<string, mixed>, to: string, name: string} $notice
     * @throws \Soltec\Kernel\ConfigurationException when APP_URL is missing
     */
    private function compose(array $notice): MailMessage
    {
        [$noun, $path] = self::SUBJECTS[$notice['subject_type']] ?? ['el registro', '/'];
        $title = $this->line($notice['subject_title']);
        $actor = $notice['actor_name'] === null ? 'Alguien' : $this->line($notice['actor_name']);
        $target = sprintf('%s «%s»', $noun, $title);
        $data = $notice['data'];

        $sentence = match ($notice['type']) {
            NotificationType::Assigned => sprintf('%s te asignó %s.', $actor, $target),
            NotificationType::Unassigned => sprintf(
                '%s asignó a otra persona %s, que tenías a tu cargo.',
                $actor,
                $target,
            ),
            NotificationType::AssigneeChanged => sprintf(
                '%s cambió la persona asignada de %s: de %s a %s.',
                $actor,
                $target,
                $this->text($data, 'from'),
                $this->text($data, 'to'),
            ),
            NotificationType::Comment => sprintf('%s comentó en %s.', $actor, $target),
            NotificationType::Mention => sprintf('%s te mencionó en %s.', $actor, $target),
            NotificationType::StateChanged => sprintf(
                '%s cambió el estado de %s: de %s a %s.',
                $actor,
                $target,
                $this->text($data, 'from'),
                $this->text($data, 'to'),
            ),
            NotificationType::DueDateChanged => sprintf(
                '%s cambió el vencimiento de %s: del %s al %s.',
                $actor,
                $target,
                $this->date($data, 'from'),
                $this->date($data, 'to'),
            ),
            NotificationType::DueSoon => sprintf(
                '%s vence mañana, el %s.',
                ucfirst($target),
                $this->date($data, 'due_date'),
            ),
            NotificationType::Overdue => sprintf(
                '%s venció el %s.',
                ucfirst($target),
                $this->date($data, 'due_date'),
            ),
            NotificationType::ClientSellerAdded => sprintf(
                '%s te agregó como asesor del cliente «%s».',
                $actor,
                $title,
            ),
            NotificationType::ClientSellerRemoved => sprintf(
                '%s te quitó como asesor del cliente «%s».',
                $actor,
                $title,
            ),
        };

        $link = rtrim($this->config->string('APP_URL'), '/') . $path . $notice['subject_id'];

        $brand = $this->line($this->config->string('MAIL_FROM_NAME', 'Soltec'));

        return new MailMessage(
            $notice['to'],
            sprintf('%s: %s', $brand, $this->subject($notice['type'], $title)),
            sprintf("Hola %s,\n\n%s\n\nÁbrelo aquí:\n%s\n", $this->line($notice['name']), $sentence, $link),
        );
    }

    private function subject(NotificationType $type, string $title): string
    {
        $what = match ($type) {
            NotificationType::Assigned => 'Te asignaron',
            NotificationType::Unassigned => 'Ya no tienes asignado',
            NotificationType::AssigneeChanged => 'Cambió el responsable de',
            NotificationType::Comment => 'Nuevo comentario en',
            NotificationType::Mention => 'Te mencionaron en',
            NotificationType::StateChanged => 'Cambió el estado de',
            NotificationType::DueDateChanged => 'Cambió el vencimiento de',
            NotificationType::DueSoon => 'Vence mañana',
            NotificationType::Overdue => 'Venció',
            NotificationType::ClientSellerAdded => 'Eres asesor de',
            NotificationType::ClientSellerRemoved => 'Ya no eres asesor de',
        };

        return mb_substr(sprintf('%s «%s»', $what, $title), 0, 150);
    }

    /** @param array<string, mixed> $data */
    private function text(array $data, string $key): string
    {
        $value = $data[$key] ?? null;

        return is_string($value) && $value !== '' ? $this->line($value) : '—';
    }

    /** @param array<string, mixed> $data */
    private function date(array $data, string $key): string
    {
        $value = $data[$key] ?? null;
        if (is_string($value) && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $parts) === 1) {
            return sprintf('%s/%s/%s', $parts[3], $parts[2], $parts[1]);
        }

        return '—';
    }

    /** Names and titles come from users: a line break must never reach a header or the body structure. */
    private function line(string $text): string
    {
        return trim((string) preg_replace('/\s+/', ' ', $text));
    }
}
