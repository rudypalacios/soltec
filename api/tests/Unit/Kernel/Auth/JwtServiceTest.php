<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel\Auth;

use Firebase\JWT\JWT;
use PHPUnit\Framework\TestCase;
use Soltec\Kernel\Auth\JwtService;
use Soltec\Kernel\Config;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Uuid;
use Soltec\Tests\Support\FixedClock;

final class JwtServiceTest extends TestCase
{
    private const SECRET = 'a-secret-long-enough-for-hs512-so-the-test-can-sign-with-it-0123456789';

    private FixedClock $clock;
    private JwtService $jwt;
    private string $userId;
    private string $deviceId;

    protected function setUp(): void
    {
        $this->clock = new FixedClock();
        $this->jwt = new JwtService(new Config(['JWT_SECRET' => self::SECRET]), $this->clock);
        $this->userId = Uuid::v7();
        $this->deviceId = Uuid::v7();
    }

    public function testRoundTripsTheClaims(): void
    {
        $claims = $this->jwt->decode($this->jwt->issue($this->userId, $this->deviceId, false));

        self::assertSame($this->userId, $claims->userId);
        self::assertSame($this->deviceId, $claims->deviceId);
        self::assertFalse($claims->restricted);
    }

    public function testARestrictedTokenSaysSo(): void
    {
        self::assertTrue($this->jwt->decode($this->jwt->issue($this->userId, $this->deviceId, true))->restricted);
    }

    public function testTheTokenCarriesNoPermissions(): void
    {
        $token = $this->jwt->issue($this->userId, $this->deviceId, false);
        $payload = json_decode((string) base64_decode(explode('.', $token)[1], true), true);

        self::assertIsArray($payload);
        self::assertEqualsCanonicalizing(['sub', 'did', 'iat', 'exp'], array_keys($payload));
    }

    public function testExpiresAfterFifteenMinutes(): void
    {
        $token = $this->jwt->issue($this->userId, $this->deviceId, false);

        $this->clock->advance('+899 seconds');
        $this->jwt->decode($token);

        $this->clock->advance('+2 seconds');
        $this->assertRejected($token, 'token_expired');
    }

    public function testRejectsATokenSignedWithAnotherSecret(): void
    {
        $other = new JwtService(
            new Config(['JWT_SECRET' => 'another-secret-with-more-than-32-characters']),
            $this->clock,
        );

        $this->assertRejected($other->issue($this->userId, $this->deviceId, false), 'token_invalid');
    }

    public function testRejectsATamperedPayload(): void
    {
        [$header, , $signature] = explode('.', $this->jwt->issue($this->userId, $this->deviceId, false));
        $forged = rtrim(strtr(base64_encode((string) json_encode([
            'sub' => $this->userId, 'did' => $this->deviceId, 'iat' => 1, 'exp' => PHP_INT_MAX,
        ])), '+/', '-_'), '=');

        $this->assertRejected($header . '.' . $forged . '.' . $signature, 'token_invalid');
    }

    public function testRejectsTheNoneAlgorithm(): void
    {
        $header = rtrim(strtr(base64_encode('{"typ":"JWT","alg":"none"}'), '+/', '-_'), '=');
        $payload = rtrim(strtr(base64_encode((string) json_encode([
            'sub' => $this->userId, 'did' => $this->deviceId, 'exp' => PHP_INT_MAX,
        ])), '+/', '-_'), '=');

        $this->assertRejected($header . '.' . $payload . '.', 'token_invalid');
    }

    public function testRejectsAnotherHmacAlgorithm(): void
    {
        $token = JWT::encode(
            ['sub' => $this->userId, 'did' => $this->deviceId, 'exp' => $this->clock->now()->getTimestamp() + 60],
            self::SECRET,
            'HS512',
        );

        $this->assertRejected($token, 'token_invalid');
    }

    public function testRejectsTokensWithoutValidIds(): void
    {
        $token = JWT::encode(
            ['sub' => 'someone', 'did' => $this->deviceId, 'exp' => $this->clock->now()->getTimestamp() + 60],
            self::SECRET,
            'HS256',
        );

        $this->assertRejected($token, 'token_invalid');
    }

    public function testRejectsGarbage(): void
    {
        $this->assertRejected('not.a.token', 'token_invalid');
        $this->assertRejected('x', 'token_invalid');
    }

    public function testRefusesToWorkWithoutAUsableSecret(): void
    {
        foreach ([[], ['JWT_SECRET' => 'too-short']] as $values) {
            $jwt = new JwtService(new Config($values), $this->clock);
            try {
                $jwt->issue($this->userId, $this->deviceId, false);
                self::fail('Expected auth_not_configured.');
            } catch (ApiException $error) {
                self::assertSame(503, $error->status);
                self::assertSame('auth_not_configured', $error->errorCode);
            }
        }
    }

    private function assertRejected(string $token, string $code): void
    {
        try {
            $this->jwt->decode($token);
            self::fail('The token should have been rejected.');
        } catch (ApiException $error) {
            self::assertSame(401, $error->status);
            self::assertSame($code, $error->errorCode);
        }
    }
}
