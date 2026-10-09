<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel\Mail;

use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Soltec\Kernel\Mail\MailMessage;

final class MailMessageTest extends TestCase
{
    public function testAcceptsAValidMessage(): void
    {
        $message = new MailMessage('person@example.com', 'Subject', 'Body');

        self::assertSame('person@example.com', $message->to);
    }

    /** @return iterable<string, array{string, string}> */
    public static function invalidFields(): iterable
    {
        yield 'recipient is not an address' => ['not-an-address', 'Subject'];
        yield 'recipient is empty' => ['', 'Subject'];
        yield 'recipient injects a header' => ["a@example.com\r\nBcc: b@example.com", 'Subject'];
        yield 'subject is empty' => ['a@example.com', '  '];
        yield 'subject injects a header' => ['a@example.com', "Hi\r\nBcc: b@example.com"];
    }

    #[DataProvider('invalidFields')]
    public function testRejectsInvalidHeaderFields(string $to, string $subject): void
    {
        $this->expectException(InvalidArgumentException::class);

        new MailMessage($to, $subject, 'Body');
    }
}
