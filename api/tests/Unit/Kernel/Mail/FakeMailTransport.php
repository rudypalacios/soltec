<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel\Mail;

use Soltec\Kernel\Mail\MailMessage;
use Soltec\Kernel\Mail\MailTransport;
use Throwable;

/** Records messages instead of sending them; can be told to fail. */
final class FakeMailTransport implements MailTransport
{
    /** @var list<MailMessage> */
    public array $sent = [];

    public function __construct(private readonly ?Throwable $failure = null)
    {
    }

    public function send(MailMessage $message): void
    {
        if ($this->failure !== null) {
            throw $this->failure;
        }
        $this->sent[] = $message;
    }

    public function driver(): string
    {
        return 'fake';
    }
}
