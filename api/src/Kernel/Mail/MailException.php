<?php

declare(strict_types=1);

namespace Soltec\Kernel\Mail;

use RuntimeException;

/** Raised when a message cannot be handed to the mail server. The message carries the server's reason. */
final class MailException extends RuntimeException
{
}
