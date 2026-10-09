<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel\Http;

use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Log\NullLogger;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;
use Soltec\Kernel\Config;
use Soltec\Kernel\ConfigurationException;
use Soltec\Kernel\Http\Controller\MailTestController;
use Soltec\Kernel\Http\ProblemResponder;
use Soltec\Kernel\Mail\MailException;
use Soltec\Tests\Unit\Kernel\Mail\FakeMailTransport;

final class MailTestControllerTest extends TestCase
{
    public function testSendsTheTestMessageToTheRequestedRecipient(): void
    {
        $transport = new FakeMailTransport();

        $response = $this->post($transport, ['to' => 'person@example.com']);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['sent' => true, 'driver' => 'fake'], $this->payload($response));
        self::assertCount(1, $transport->sent);
        self::assertSame('person@example.com', $transport->sent[0]->to);
        self::assertStringContainsString('Entorno: testing', $transport->sent[0]->body);
    }

    public function testRejectsAMissingOrInvalidRecipientWithoutSending(): void
    {
        $transport = new FakeMailTransport();

        foreach ([[], ['to' => 'nope'], ['to' => ['a@example.com']]] as $body) {
            $response = $this->post($transport, $body);

            self::assertSame(422, $response->getStatusCode());
            self::assertSame('invalid_recipient', $this->payload($response)['code']);
        }
        self::assertSame([], $transport->sent);
    }

    public function testReportsMissingMailSettings(): void
    {
        $response = $this->post(
            new FakeMailTransport(ConfigurationException::missing('MAIL_HOST')),
            ['to' => 'person@example.com'],
        );

        self::assertSame(503, $response->getStatusCode());
        self::assertSame('mail_not_configured', $this->payload($response)['code']);
    }

    public function testReportsTheServerReasonWhenSendingFails(): void
    {
        $response = $this->post(
            new FakeMailTransport(new MailException('SMTP Error: Could not authenticate.')),
            ['to' => 'person@example.com'],
        );

        self::assertSame(502, $response->getStatusCode());
        $payload = $this->payload($response);
        self::assertSame('mail_send_failed', $payload['code']);
        self::assertSame('SMTP Error: Could not authenticate.', $payload['detail']);
    }

    /** @param array<string, mixed> $body */
    private function post(FakeMailTransport $transport, array $body): ResponseInterface
    {
        $factory = new ResponseFactory();
        $controller = new MailTestController(
            $transport,
            new Config(['APP_ENV' => 'testing']),
            new ProblemResponder($factory),
            new NullLogger(),
        );
        $request = (new ServerRequestFactory())->createServerRequest('POST', '/system/mail/test')
            ->withParsedBody($body);

        return $controller->send($request, $factory->createResponse());
    }

    /** @return array<string, mixed> */
    private function payload(ResponseInterface $response): array
    {
        $decoded = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($decoded);

        return $decoded;
    }
}
