<?php

declare(strict_types=1);

namespace Soltec\Kernel\Auth;

use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Soltec\Kernel\Clock;
use Soltec\Kernel\Config;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Uuid;
use Throwable;

/**
 * Issues and validates the short-lived access token (HS256).
 *
 * The token carries only the user, the device and the expiry: permissions are read from the database on
 * every request, so a change of role or a deactivation applies at once (ADR-0012).
 */
final class JwtService
{
    public const TTL_SECONDS = 900;
    private const ALGORITHM = 'HS256';
    private const MIN_SECRET_LENGTH = 32;
    private const RESTRICTED_SCOPE = 'password_change';

    public function __construct(private readonly Config $config, private readonly Clock $clock)
    {
    }

    /** @throws ApiException 503 when the secret is missing or too short */
    public function assertConfigured(): void
    {
        $this->secret();
    }

    public function issue(string $userId, string $deviceId, bool $restricted): string
    {
        $issuedAt = $this->clock->now()->getTimestamp();
        $claims = [
            'sub' => $userId,
            'did' => $deviceId,
            'iat' => $issuedAt,
            'exp' => $issuedAt + self::TTL_SECONDS,
        ];
        if ($restricted) {
            $claims['scp'] = self::RESTRICTED_SCOPE;
        }

        return JWT::encode($claims, $this->secret(), self::ALGORITHM);
    }

    /** @throws ApiException 401 `token_expired` or `token_invalid`; 503 when the secret is not configured */
    public function decode(string $token): AccessClaims
    {
        $secret = $this->secret();
        $previous = JWT::$timestamp;
        JWT::$timestamp = $this->clock->now()->getTimestamp();
        try {
            $payload = (array) JWT::decode($token, new Key($secret, self::ALGORITHM));
        } catch (ExpiredException) {
            throw ApiException::unauthorized('token_expired');
        } catch (Throwable) {
            throw ApiException::unauthorized('token_invalid');
        } finally {
            JWT::$timestamp = $previous;
        }

        $userId = $payload['sub'] ?? null;
        $deviceId = $payload['did'] ?? null;
        if (!is_string($userId) || !Uuid::isValid($userId) || !is_string($deviceId) || !Uuid::isValid($deviceId)) {
            throw ApiException::unauthorized('token_invalid');
        }

        return new AccessClaims($userId, $deviceId, ($payload['scp'] ?? null) === self::RESTRICTED_SCOPE);
    }

    private function secret(): string
    {
        $secret = $this->config->optionalString('JWT_SECRET');
        if ($secret === null || strlen($secret) < self::MIN_SECRET_LENGTH) {
            throw ApiException::notConfigured('JWT_SECRET is missing or shorter than 32 characters.');
        }

        return $secret;
    }
}
