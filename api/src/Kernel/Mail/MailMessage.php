<?php

declare(strict_types=1);

namespace Soltec\Kernel\Mail;

use InvalidArgumentException;

/** A plain-text message to one recipient. Header fields are validated here, once, for every transport. */
final class MailMessage
{
    public function __construct(
        public readonly string $to,
        public readonly string $subject,
        public readonly string $body,
    ) {
        if (filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
            throw new InvalidArgumentException('The recipient is not a valid email address.');
        }
        if (trim($subject) === '' || preg_match('/[\r\n]/', $subject) === 1) {
            throw new InvalidArgumentException('The subject must be one non-empty line.');
        }
    }
}
