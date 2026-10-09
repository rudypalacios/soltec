<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Access;

use Psr\Http\Message\ResponseInterface;
use Soltec\Kernel\Mail\MailException;
use Soltec\Kernel\Uuid;

/** Invitations and password recovery by email link (ADR-0017). */
final class CredentialsTest extends AccessTestCase
{
    private const NEW_PASSWORD = 'a brand new passphrase';

    private string $adminToken;
    private string $managerRole;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminToken = $this->tokenFor($this->createAdmin()['id']);
        $this->managerRole = $this->createRole(
            'User manager',
            ['users' => ['view', 'create', 'edit', 'deactivate']],
            ['users' => 'all'],
        );
    }

    // --- accepting an invitation ------------------------------------------------------------------------------

    public function testAcceptingTheInvitationSetsThePasswordAndAllowsLogin(): void
    {
        $token = $this->invite('ana@example.com');

        $response = $this->accept($token);

        self::assertSame(204, $response->getStatusCode());
        $login = $this->login('ana@example.com', self::NEW_PASSWORD);
        self::assertSame(200, $login->getStatusCode());
        self::assertFalse($this->json($login)['password_change_required']);
        $user = $this->json($this->api('GET', '/users/' . $this->userId('ana@example.com'), $this->adminToken));
        self::assertFalse($user['invitation_pending']);
        self::assertFalse($user['must_change_password']);
    }

    public function testAnInvitationLinkWorksOnlyOnce(): void
    {
        $token = $this->invite('ana@example.com');
        $this->accept($token);

        $second = $this->accept($token, 'another passphrase 99');

        self::assertSame(400, $second->getStatusCode());
        self::assertSame('link_invalid', $this->json($second)['code']);
        self::assertSame(401, $this->login('ana@example.com', 'another passphrase 99')->getStatusCode());
    }

    public function testASpentLinkIsRejectedBeforeThePasswordIsEvenLookedAt(): void
    {
        $token = $this->invite('ana@example.com');
        $this->accept($token);

        $response = $this->accept($token, 'short');

        self::assertSame(400, $response->getStatusCode());
        self::assertSame('link_invalid', $this->json($response)['code']);
    }

    public function testAWeakPasswordIsRejectedWithoutSpendingTheLink(): void
    {
        $token = $this->invite('ana@example.com');

        $weak = $this->accept($token, 'short');
        $email = $this->accept($token, 'ana@example.com');

        self::assertSame(422, $weak->getStatusCode());
        self::assertSame([['field' => 'password', 'code' => 'too_short']], $this->json($weak)['errors']);
        self::assertSame(422, $email->getStatusCode());
        self::assertSame(204, $this->accept($token)->getStatusCode());
    }

    public function testTheLinkExpiresAfterSeventyTwoHours(): void
    {
        $early = $this->invite('ana@example.com');
        $late = $this->invite('luis@example.com');

        $this->clock->advance('+71 hours 59 minutes');
        self::assertSame(204, $this->accept($early)->getStatusCode());

        $this->clock->advance('+1 minute');
        $expired = $this->accept($late);
        self::assertSame(400, $expired->getStatusCode());
        self::assertSame('link_expired', $this->json($expired)['code']);
    }

    public function testResendingInvalidatesThePreviousLink(): void
    {
        $first = $this->invite('ana@example.com');
        $id = $this->userId('ana@example.com');

        $resend = $this->api('POST', '/users/' . $id . '/invite', $this->adminToken);
        $second = $this->lastLinkToken('ana@example.com');

        self::assertSame(204, $resend->getStatusCode());
        self::assertNotSame($first, $second);
        self::assertSame('link_invalid', $this->json($this->accept($first))['code']);
        self::assertSame(204, $this->accept($second)->getStatusCode());
    }

    public function testNoTokenIsStoredInClear(): void
    {
        $token = $this->invite('ana@example.com');

        $count = 'SELECT COUNT(*) FROM account_tokens WHERE token_hash = :t';
        self::assertSame(0, $this->countRows($count, ['t' => $token]));
        self::assertSame(1, $this->countRows($count, ['t' => hash('sha256', $token)]));
    }

    public function testChangingTheEmailKillsTheLinkSentToTheOldAddress(): void
    {
        $token = $this->invite('ana@example.com');
        $id = $this->userId('ana@example.com');

        $changes = ['version' => 1, 'email' => 'ana2@example.com'];
        $update = $this->api('PATCH', '/users/' . $id, $this->adminToken, $changes);

        self::assertSame(200, $update->getStatusCode());
        self::assertSame('link_invalid', $this->json($this->accept($token))['code']);
    }

    public function testADeactivatedUserCannotAcceptTheirInvitation(): void
    {
        $token = $this->invite('ana@example.com');
        $this->api('POST', '/users/' . $this->userId('ana@example.com') . '/deactivate', $this->adminToken);

        self::assertSame('link_invalid', $this->json($this->accept($token))['code']);
        self::assertSame(401, $this->login('ana@example.com', self::NEW_PASSWORD)->getStatusCode());
    }

    public function testMalformedAndUnknownTokensAreRejected(): void
    {
        $short = $this->accept('abc');
        $notHex = $this->accept(str_repeat('z', 64));
        $unknown = $this->accept(str_repeat('a', 64));

        self::assertSame(['token' => 'too_short'], $this->errorCodes($short));
        self::assertSame(['token' => 'invalid'], $this->errorCodes($notHex));
        self::assertSame(400, $unknown->getStatusCode());
        self::assertSame('link_invalid', $this->json($unknown)['code']);
    }

    public function testARecoveryLinkDoesNotAcceptAnInvitationAndViceVersa(): void
    {
        $invitation = $this->invite('ana@example.com');
        $this->accept($invitation);
        $this->forgot('ana@example.com');
        $reset = $this->lastLinkToken('ana@example.com');

        self::assertSame('link_invalid', $this->json($this->accept($reset))['code']);
        self::assertSame('link_invalid', $this->json($this->reset($invitation))['code']);
    }

    public function testAcceptingIsAudited(): void
    {
        $token = $this->invite('ana@example.com');
        $id = $this->userId('ana@example.com');
        $this->accept($token);

        $actions = array_column($this->auditEntries('users', $id), 'action');
        $accepted = array_values(array_filter(
            $this->auditEntries('users', $id),
            static fn (array $entry): bool => $entry['action'] === 'accept_invitation',
        ));

        self::assertSame(['create', 'invite', 'accept_invitation'], $actions);
        self::assertSame($id, $accepted[0]['userId']);
        self::assertStringNotContainsString($token, (string) json_encode($this->auditEntries('users', $id)));
    }

    // --- resending ----------------------------------------------------------------------------------------------

    public function testOnlyAPendingInvitationCanBeResent(): void
    {
        $this->invite('ana@example.com');
        $this->accept($this->lastLinkToken('ana@example.com'));
        $accepted = $this->api('POST', '/users/' . $this->userId('ana@example.com') . '/invite', $this->adminToken);
        $unknown = $this->api('POST', '/users/' . Uuid::v7() . '/invite', $this->adminToken);

        self::assertSame(409, $accepted->getStatusCode());
        self::assertSame('invitation_not_pending', $this->json($accepted)['code']);
        self::assertSame(404, $unknown->getStatusCode());
    }

    public function testResendingNeedsPermissionAndOnlyAnAdminReachesAnAdmin(): void
    {
        $pending = $this->createUser('pending@example.com', invitationPending: true);
        $adminPending = $this->createUser('adm2@example.com', [$this->adminRoleId()], invitationPending: true);
        $viewerRole = $this->createRole('Viewer', ['users' => ['view']], ['users' => 'all']);
        $viewer = $this->createUser('viewer@example.com', [$viewerRole]);
        $manager = $this->createUser('manager@example.com', [$this->managerRole]);

        $viewerToken = $this->tokenFor($viewer['id']);
        $managerToken = $this->tokenFor($manager['id']);

        self::assertSame(403, $this->resend($pending['id'], $viewerToken)->getStatusCode());
        self::assertSame(204, $this->resend($pending['id'], $managerToken)->getStatusCode());
        self::assertSame(403, $this->resend($adminPending['id'], $managerToken)->getStatusCode());
        self::assertSame(204, $this->resend($adminPending['id'], $this->adminToken)->getStatusCode());
    }

    public function testAMailFailureWhenResendingIsReported(): void
    {
        $pending = $this->createUser('pending@example.com', invitationPending: true);
        $this->mail->failWith(new MailException('SMTP down'));

        $response = $this->api('POST', '/users/' . $pending['id'] . '/invite', $this->adminToken);

        self::assertSame(502, $response->getStatusCode());
        self::assertSame('mail_send_failed', $this->json($response)['code']);
        self::assertStringNotContainsString('SMTP down', (string) $response->getBody());
    }

    // --- password recovery ----------------------------------------------------------------------------------

    public function testRecoveryEmailsAnActiveAccountThatAcceptedItsInvitation(): void
    {
        $this->createUser('ana@example.com');

        $response = $this->forgot('ana@example.com');

        self::assertSame(204, $response->getStatusCode());
        self::assertCount(1, $this->mail->sent);
        self::assertSame('ana@example.com', $this->mail->sent[0]->to);
        self::assertStringContainsString(
            'https://app.example.test/restablecer-contrasena#token=',
            $this->mail->sent[0]->body,
        );
    }

    public function testTheAnswerIsTheSameWhateverTheAccountIs(): void
    {
        $this->createUser('ana@example.com');
        $this->createUser('pending@example.com', invitationPending: true);
        $gone = $this->createUser('gone@example.com');
        $this->api('POST', '/users/' . $gone['id'] . '/deactivate', $this->adminToken);

        $answers = [];
        foreach (['ana@example.com', 'nobody@example.com', 'pending@example.com', 'gone@example.com'] as $email) {
            $response = $this->forgot($email);
            $answers[] = [$response->getStatusCode(), (string) $response->getBody()];
        }

        self::assertSame([[204, ''], [204, ''], [204, ''], [204, '']], $answers);
        self::assertSame(['ana@example.com'], array_map(static fn ($m): string => $m->to, $this->mail->sent));
    }

    public function testAMalformedEmailIsAFieldError(): void
    {
        self::assertSame(422, $this->forgot('not-an-email')->getStatusCode());
    }

    public function testOnlyOneRecoveryEmailPerMinutePerAccount(): void
    {
        $this->createUser('ana@example.com');

        $this->forgot('ana@example.com');
        $first = $this->lastLinkToken('ana@example.com');
        $this->clock->advance('+59 seconds');
        $this->forgot('ana@example.com');
        self::assertCount(1, $this->mail->sent);

        $this->clock->advance('+2 seconds');
        $this->forgot('ana@example.com');
        self::assertCount(2, $this->mail->sent);
        self::assertSame('link_invalid', $this->json($this->reset($first))['code']);
        self::assertSame(204, $this->reset($this->lastLinkToken('ana@example.com'))->getStatusCode());
    }

    public function testAMailFailureStillAnswers204(): void
    {
        $this->createUser('ana@example.com');
        $this->mail->failWith(new MailException('SMTP down'));

        self::assertSame(204, $this->forgot('ana@example.com')->getStatusCode());
    }

    // --- resetting ------------------------------------------------------------------------------------------

    public function testResettingChangesThePasswordClearsTheLockAndSignsEveryDeviceOut(): void
    {
        $user = $this->createUser('ana@example.com');
        $session = $this->sessionFor($user['id']);
        for ($i = 0; $i < 3; $i++) {
            $this->login('ana@example.com', 'wrong password here');
        }
        self::assertSame(401, $this->login('ana@example.com')->getStatusCode());
        $this->forgot('ana@example.com');

        $response = $this->reset($this->lastLinkToken('ana@example.com'));

        self::assertSame(204, $response->getStatusCode());
        self::assertSame(401, $this->login('ana@example.com')->getStatusCode());
        self::assertSame(200, $this->login('ana@example.com', self::NEW_PASSWORD)->getStatusCode());
        self::assertSame(
            1,
            $this->countRows(
                'SELECT COUNT(*) FROM devices WHERE id = UNHEX(:id) AND revoked_at IS NOT NULL',
                ['id' => Uuid::toHex($session['deviceId'])],
            ),
        );
        self::assertSame(401, $this->api('GET', '/me', $session['token'])->getStatusCode());
    }

    public function testAResetLinkWorksOnlyOnce(): void
    {
        $this->createUser('ana@example.com');
        $this->forgot('ana@example.com');
        $token = $this->lastLinkToken('ana@example.com');
        $this->reset($token);

        $second = $this->reset($token, 'yet another passphrase');

        self::assertSame('link_invalid', $this->json($second)['code']);
        self::assertSame(401, $this->login('ana@example.com', 'yet another passphrase')->getStatusCode());
    }

    public function testASpentResetLinkIsRejectedBeforeThePasswordIsLookedAt(): void
    {
        $this->createUser('ana@example.com');
        $this->forgot('ana@example.com');
        $token = $this->lastLinkToken('ana@example.com');
        $this->reset($token);

        $response = $this->reset($token, 'short');

        self::assertSame('link_invalid', $this->json($response)['code']);
    }

    public function testAResetLinkExpiresAfterOneHour(): void
    {
        $this->createUser('ana@example.com');
        $this->forgot('ana@example.com');
        $token = $this->lastLinkToken('ana@example.com');

        $this->clock->advance('+60 minutes');
        $response = $this->reset($token);

        self::assertSame(400, $response->getStatusCode());
        self::assertSame('link_expired', $this->json($response)['code']);
    }

    public function testAnAccountDeactivatedAfterTheRequestCannotReset(): void
    {
        $user = $this->createUser('ana@example.com');
        $this->forgot('ana@example.com');
        $token = $this->lastLinkToken('ana@example.com');
        $this->api('POST', '/users/' . $user['id'] . '/deactivate', $this->adminToken);

        self::assertSame('link_invalid', $this->json($this->reset($token))['code']);
        self::assertSame(401, $this->login('ana@example.com', self::NEW_PASSWORD)->getStatusCode());
    }

    public function testAWeakNewPasswordDoesNotSpendTheLink(): void
    {
        $this->createUser('ana@example.com');
        $this->forgot('ana@example.com');
        $token = $this->lastLinkToken('ana@example.com');

        $weak = $this->reset($token, 'short');

        self::assertSame(422, $weak->getStatusCode());
        self::assertSame([['field' => 'password', 'code' => 'too_short']], $this->json($weak)['errors']);
        self::assertSame(204, $this->reset($token)->getStatusCode());
    }

    public function testResettingIsAuditedWithoutSecrets(): void
    {
        $user = $this->createUser('ana@example.com');
        $this->forgot('ana@example.com');
        $token = $this->lastLinkToken('ana@example.com');
        $this->reset($token);

        $entries = $this->auditEntries('users', $user['id']);

        self::assertSame(['password_reset_request', 'password_reset'], array_column($entries, 'action'));
        self::assertSame($user['id'], $entries[1]['userId']);
        self::assertStringNotContainsString($token, (string) json_encode($entries));
        self::assertStringNotContainsString(self::NEW_PASSWORD, (string) json_encode($entries));
    }

    // --- helpers --------------------------------------------------------------------------------------------

    /** Creates the user through the API and returns the token of the email they received. */
    private function invite(string $email): string
    {
        $response = $this->api('POST', '/users', $this->adminToken, [
            'name' => 'Invited Person',
            'email' => $email,
            'role_ids' => [$this->managerRole],
        ]);
        self::assertSame(201, $response->getStatusCode());

        return $this->lastLinkToken($email);
    }

    private function accept(string $token, string $password = self::NEW_PASSWORD): ResponseInterface
    {
        return $this->api('POST', '/auth/invitations/accept', null, ['token' => $token, 'password' => $password]);
    }

    private function forgot(string $email): ResponseInterface
    {
        return $this->api('POST', '/auth/password/forgot', null, ['email' => $email]);
    }

    private function reset(string $token, string $password = self::NEW_PASSWORD): ResponseInterface
    {
        return $this->api('POST', '/auth/password/reset', null, ['token' => $token, 'password' => $password]);
    }

    private function resend(string $userId, string $token): ResponseInterface
    {
        return $this->api('POST', '/users/' . $userId . '/invite', $token);
    }

    private function userId(string $email): string
    {
        $sql = 'SELECT LOWER(HEX(id)) FROM users WHERE email = :email';
        $hex = $this->connection->fetchOne($sql, ['email' => $email]);
        self::assertIsString($hex);

        return Uuid::fromHex($hex);
    }
}
