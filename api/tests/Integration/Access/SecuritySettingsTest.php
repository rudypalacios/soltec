<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use PHPUnit\Framework\Attributes\DataProvider;
use Soltec\Modules\Access\Application\AdminBootstrap;

/** The parameters are stored and validated, and above all the sign-in obeys them. */
final class SecuritySettingsTest extends AccessTestCase
{
    private string $adminToken = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminToken = $this->tokenFor($this->createAdmin()['id']);
    }

    /**
     * @param array<string, mixed> $changes
     * @return array<string, mixed>
     */
    private function body(array $changes = []): array
    {
        return $changes + [
            'version' => 1,
            'web_idle_minutes' => 30,
            'mobile_refresh_days' => 30,
            'max_failed_attempts' => 3,
            'lockout_minutes' => 15,
            'password_expiry_days' => 90,
            'password_min_length' => 12,
        ];
    }

    /** @param array<string, mixed> $changes */
    private function configure(array $changes): void
    {
        $response = $this->api('PATCH', '/settings/security', $this->adminToken, $this->body($changes));
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
    }

    private function failLogins(string $email, int $times): void
    {
        for ($i = 0; $i < $times; $i++) {
            $this->login($email, 'a wrong password');
        }
    }

    public function testStartsWithTheValuesTheConstantsHad(): void
    {
        $settings = $this->json($this->api('GET', '/settings/security', $this->adminToken));

        self::assertSame(30, $settings['web_idle_minutes']);
        self::assertSame(30, $settings['mobile_refresh_days']);
        self::assertSame(3, $settings['max_failed_attempts']);
        self::assertSame(15, $settings['lockout_minutes']);
        self::assertSame(90, $settings['password_expiry_days']);
        self::assertSame(12, $settings['password_min_length']);
        self::assertSame(1, $settings['version']);
    }

    public function testUpdatesAndAuditsTheChangedValuesOnly(): void
    {
        $response = $this->api(
            'PATCH',
            '/settings/security',
            $this->adminToken,
            $this->body(['max_failed_attempts' => 5, 'password_min_length' => 14]),
        );

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(2, $this->json($response)['version']);
        $audit = $this->auditEntries('security_settings');
        self::assertCount(1, $audit);
        self::assertSame('update', $audit[0]['action']);
        self::assertSame(['max_failed_attempts' => 3, 'password_min_length' => 12], $audit[0]['before']);
        self::assertSame(['max_failed_attempts' => 5, 'password_min_length' => 14], $audit[0]['after']);
    }

    public function testSavingTheSameValuesChangesNothing(): void
    {
        $response = $this->api('PATCH', '/settings/security', $this->adminToken, $this->body());

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(1, $this->json($response)['version']);
        self::assertSame([], $this->auditEntries('security_settings'));
    }

    /** @return array<string, array{string, int, int}> */
    public static function limits(): array
    {
        return [
            'idle' => ['web_idle_minutes', 5, 1440],
            'mobile' => ['mobile_refresh_days', 1, 90],
            'attempts' => ['max_failed_attempts', 3, 20],
            'lockout' => ['lockout_minutes', 1, 1440],
            'expiry' => ['password_expiry_days', 30, 365],
            'length' => ['password_min_length', 12, 72],
        ];
    }

    #[DataProvider('limits')]
    public function testEachParameterAcceptsItsLimitsAndRejectsWhatIsOutside(string $field, int $min, int $max): void
    {
        foreach ([$min - 1, $max + 1] as $outside) {
            $response = $this->api('PATCH', '/settings/security', $this->adminToken, $this->body([$field => $outside]));
            self::assertSame(422, $response->getStatusCode(), "$field = $outside");
            self::assertSame([$field => 'out_of_range'], $this->errorCodes($response));
        }

        $this->configure([$field => $max]);
        $this->configure([$field => $min, 'version' => 2]);
        self::assertSame(3, $this->json($this->api('GET', '/settings/security', $this->adminToken))['version']);
    }

    public function testTheMinimumLengthCanNeverGoBelowTwelve(): void
    {
        $tooShort = $this->body(['password_min_length' => 8]);
        $response = $this->api('PATCH', '/settings/security', $this->adminToken, $tooShort);

        self::assertSame(['password_min_length' => 'out_of_range'], $this->errorCodes($response));
    }

    public function testRejectsNumbersSentAsTextAndMissingFields(): void
    {
        $response = $this->api('PATCH', '/settings/security', $this->adminToken, $this->body([
            'lockout_minutes' => '15',
            'password_expiry_days' => null,
        ]));

        self::assertSame(422, $response->getStatusCode());
        $errors = $this->errorCodes($response);
        self::assertSame('invalid', $errors['lockout_minutes'] ?? null);
        self::assertSame('required', $errors['password_expiry_days'] ?? null);
    }

    public function testAStaleVersionIsAConflictAndThePermissionsAreChecked(): void
    {
        $this->configure(['lockout_minutes' => 20]);

        $stale = $this->api('PATCH', '/settings/security', $this->adminToken, $this->body());
        self::assertSame(409, $stale->getStatusCode());

        $viewer = $this->tokenWith('security_settings', 'view');
        self::assertSame(200, $this->api('GET', '/settings/security', $viewer)->getStatusCode());
        $denied = $this->api('PATCH', '/settings/security', $viewer, $this->body(['version' => 2]));
        self::assertSame(403, $denied->getStatusCode());

        $nobody = $this->tokenWith('users', 'view');
        self::assertSame(403, $this->api('GET', '/settings/security', $nobody)->getStatusCode());
        self::assertSame(401, $this->api('GET', '/settings/security')->getStatusCode());
    }

    public function testTheNumberOfFailuresThatLockFollowsTheSetting(): void
    {
        $this->createUser('ana@example.com');
        $this->configure(['max_failed_attempts' => 5]);

        $this->failLogins('ana@example.com', 4);
        self::assertSame(200, $this->login('ana@example.com')->getStatusCode(), 'Four failures do not lock at five.');

        $this->failLogins('ana@example.com', 5);
        self::assertSame(401, $this->login('ana@example.com')->getStatusCode());
    }

    public function testHowLongTheLockLastsFollowsTheSetting(): void
    {
        $this->createUser('ana@example.com');
        $this->configure(['lockout_minutes' => 45]);
        $this->failLogins('ana@example.com', 3);

        $this->clock->advance('+44 minutes');
        self::assertSame(401, $this->login('ana@example.com')->getStatusCode(), 'Still locked at 44 minutes.');

        $this->clock->advance('+2 minutes');
        self::assertSame(200, $this->login('ana@example.com')->getStatusCode());
    }

    public function testPasswordExpiryFollowsTheSettingAndCountsFromWhenThePasswordWasSet(): void
    {
        $this->createUser('old@example.com', passwordChangedAt: $this->clock->now()->modify('-31 days'));
        $this->createUser('fresh@example.com', passwordChangedAt: $this->clock->now()->modify('-29 days'));
        $this->configure(['password_expiry_days' => 30]);

        self::assertTrue($this->json($this->login('old@example.com'))['password_change_required']);
        self::assertFalse($this->json($this->login('fresh@example.com'))['password_change_required']);
    }

    public function testTheMinimumLengthIsEnforcedAndTheProblemSaysWhatItIs(): void
    {
        $user = $this->createUser('ana@example.com');
        $this->configure(['password_min_length' => 16]);
        $token = $this->tokenFor($user['id']);

        $short = $this->api('POST', '/auth/password/change', $token, [
            'current_password' => self::PASSWORD,
            'new_password' => str_repeat('a', 15),
        ]);

        self::assertSame(422, $short->getStatusCode());
        self::assertSame(['new_password' => 'too_short'], $this->errorCodes($short));
        self::assertSame(16, $this->json($short)['password_min_length']);

        $enough = $this->api('POST', '/auth/password/change', $token, [
            'current_password' => self::PASSWORD,
            'new_password' => str_repeat('a', 16),
        ]);
        self::assertSame(204, $enough->getStatusCode());
    }

    public function testExistingPasswordsStayValidWhenTheMinimumGoesUp(): void
    {
        $this->createUser('ana@example.com');
        $this->configure(['password_min_length' => 40]);

        self::assertSame(200, $this->login('ana@example.com')->getStatusCode());
    }

    public function testTheFirstAdministratorIsHeldToTheConfiguredMinimumToo(): void
    {
        $this->configure(['password_min_length' => 20]);
        $bootstrap = $this->service(AdminBootstrap::class);

        self::assertSame('password_too_short', $bootstrap->passwordError(str_repeat('a', 19), 'boss@example.com'));
        self::assertNull($bootstrap->passwordError(str_repeat('a', 20), 'boss@example.com'));
        self::assertSame(20, $bootstrap->passwordMinLength());
    }

    public function testAWebSessionLastsTheConfiguredIdleTime(): void
    {
        $this->createUser('ana@example.com');
        $this->configure(['web_idle_minutes' => 45]);

        $response = $this->login('ana@example.com');

        self::assertStringContainsString('Max-Age=2700', (string) $this->setCookie($response));
        $expires = $this->refreshExpiry();
        self::assertSame(
            $this->clock->now()->modify('+45 minutes')->format('Y-m-d H:i:s.v'),
            $expires,
        );
    }

    public function testAMobileSessionLastsTheConfiguredDays(): void
    {
        $this->createUser('ana@example.com');
        $this->configure(['mobile_refresh_days' => 7]);

        $this->login('ana@example.com', body: ['device' => ['platform' => 'android', 'name' => 'Pixel']]);

        $expires = $this->refreshExpiry();
        self::assertSame($this->clock->now()->modify('+7 days')->format('Y-m-d H:i:s.v'), $expires);
    }

    public function testASessionAlreadyOpenKeepsTheExpiryItWasIssuedWith(): void
    {
        $this->createUser('ana@example.com');
        $this->login('ana@example.com', body: ['device' => ['platform' => 'android', 'name' => 'Pixel']]);
        $before = $this->refreshExpiry();

        $this->configure(['mobile_refresh_days' => 1]);

        self::assertSame($before, $this->refreshExpiry());
    }

    /** When the most recent refresh token expires, as the database stores it. */
    private function refreshExpiry(): string
    {
        $expires = $this->connection->fetchOne(
            'SELECT expires_at FROM refresh_tokens ORDER BY created_at DESC LIMIT 1',
        );
        self::assertIsString($expires);

        return $expires;
    }
}
