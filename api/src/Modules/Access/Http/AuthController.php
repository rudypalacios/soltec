<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Soltec\Kernel\Auth\AuthenticationMiddleware;
use Soltec\Kernel\Auth\CurrentUser;
use Soltec\Kernel\Auth\JwtService;
use Soltec\Kernel\Http\ApiException;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\Json;
use Soltec\Kernel\Uuid;
use Soltec\Modules\Access\Application\ActorContext;
use Soltec\Modules\Access\Application\AuthService;
use Soltec\Modules\Access\Application\TokenResult;
use Soltec\Modules\Access\Domain\SecurityPolicy;

/** POST /v1/auth/login, /refresh, /logout and /password/change. */
final class AuthController
{
    public function __construct(private readonly AuthService $auth, private readonly RefreshCookie $cookie)
    {
    }

    public function login(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $email = $input->email('email');
        $password = $input->secret('password');
        $deviceData = $input->object('device');
        $device = Input::nested('device', $deviceData ?? []);
        $platform = $deviceData === null ? null : $device->choice('platform', ['web', 'android', 'ios']);
        $deviceName = $deviceData === null ? null : $device->nullableText('name', 100);
        $deviceId = $deviceData === null ? null : $this->optionalUuid($device, $deviceData, 'id');
        $input->absorb($device);
        $input->done();

        $result = $this->auth->login((string) $email, (string) $password, (string) $platform, $deviceName, $deviceId);

        return $this->tokens($response, $result);
    }

    public function refresh(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $fromCookie = $this->cookie->read($request);
        $body = $request->getParsedBody();
        $fromBody = is_array($body) && is_string($body['refresh_token'] ?? null) ? $body['refresh_token'] : null;
        $token = $fromCookie ?? $fromBody ?? throw ApiException::unauthorized('token_invalid');

        return $this->tokens($response, $this->auth->refresh($token, $fromCookie !== null));
    }

    public function logout(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $this->auth->logout($this->user($request));

        return $this->cookie->clear($response->withStatus(204));
    }

    public function changePassword(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::body($request);
        $current = $input->secret('current_password');
        $new = $input->secret('new_password');
        $input->done();

        $this->auth->changePassword(
            $this->user($request),
            ActorContext::fromRequest($request),
            (string) $current,
            (string) $new,
        );

        return $response->withStatus(204);
    }

    private function tokens(ResponseInterface $response, TokenResult $result): ResponseInterface
    {
        $payload = [
            'access_token' => $result->accessToken,
            'token_type' => 'Bearer',
            'expires_in' => JwtService::TTL_SECONDS,
            'password_change_required' => $result->passwordChangeRequired,
        ];
        if ($result->user !== null) {
            $payload['device_id'] = $result->deviceId;
            $payload['user'] = MePresenter::toArray($result->user);
        }

        if ($result->refreshToken !== null) {
            if ($result->platform === 'web') {
                $maxAge = SecurityPolicy::WEB_IDLE_MINUTES * 60;
                $response = $this->cookie->set($response, $result->refreshToken, $maxAge);
            } else {
                $payload['refresh_token'] = $result->refreshToken;
            }
        }

        return Json::write($response, $payload);
    }

    /** @param array<array-key, mixed> $data */
    private function optionalUuid(Input $input, array $data, string $field): ?string
    {
        $value = $data[$field] ?? null;
        if ($value === null) {
            return null;
        }
        if (!is_string($value) || !Uuid::isValid($value)) {
            $input->fail($field, 'invalid');

            return null;
        }

        return $value;
    }

    private function user(ServerRequestInterface $request): CurrentUser
    {
        $user = $request->getAttribute(AuthenticationMiddleware::USER_ATTRIBUTE);

        return $user instanceof CurrentUser ? $user : throw ApiException::unauthorized('token_invalid');
    }
}
