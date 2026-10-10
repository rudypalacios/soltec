<?php

declare(strict_types=1);

namespace Soltec\Tests\Integration\Settings;

final class CompanyTest extends SettingsTestCase
{
    /** @return array<string, mixed> */
    private function validBody(int $version = 1): array
    {
        return [
            'version' => $version,
            'legal_name' => 'Sistemas Soltec, S.A.',
            'trade_name' => 'Soltec',
            'tax_id' => '1234567-8',
            'address' => '1a. avenida 2-34, zona 10',
            'phone' => '2222-3333',
            'email' => 'Info@Soltec.Example',
            'timezone' => 'America/Guatemala',
        ];
    }

    public function testStartsEmptyWithoutAnyClientDataSeeded(): void
    {
        $company = $this->json($this->api('GET', '/settings/company', $this->adminToken));

        self::assertSame('', $company['legal_name']);
        self::assertSame('', $company['trade_name']);
        self::assertSame('America/Guatemala', $company['timezone']);
        self::assertNull($company['logo_version']);
        self::assertSame(1, $company['version']);
    }

    public function testUpdatesTheCompanyAndAuditsOnlyWhatChanged(): void
    {
        $response = $this->api('PATCH', '/settings/company', $this->adminToken, $this->validBody());

        self::assertSame(200, $response->getStatusCode());
        $company = $this->json($response);
        self::assertSame('Soltec', $company['trade_name']);
        self::assertSame('info@soltec.example', $company['email']);
        self::assertSame(2, $company['version']);

        $audit = $this->auditEntries('company');
        self::assertCount(1, $audit);
        self::assertSame('update', $audit[0]['action']);
        self::assertSame('Soltec', $audit[0]['after']['trade_name'] ?? null);
        self::assertSame('', $audit[0]['before']['trade_name'] ?? null);
        self::assertArrayNotHasKey('timezone', $audit[0]['after'], 'The time zone did not change.');
    }

    public function testSavingTheSameDataChangesNothing(): void
    {
        $this->api('PATCH', '/settings/company', $this->adminToken, $this->validBody());
        $again = $this->json($this->api('PATCH', '/settings/company', $this->adminToken, $this->validBody(2)));

        self::assertSame(2, $again['version']);
        self::assertCount(1, $this->auditEntries('company'));
    }

    public function testRejectsAStaleVersion(): void
    {
        $this->api('PATCH', '/settings/company', $this->adminToken, $this->validBody());

        $stale = $this->api('PATCH', '/settings/company', $this->adminToken, $this->validBody());

        self::assertSame(409, $stale->getStatusCode());
        self::assertSame('conflict', $this->json($stale)['code']);
    }

    public function testValidatesEveryField(): void
    {
        $body = ['version' => 1, 'legal_name' => ' ', 'trade_name' => '', 'tax_id' => str_repeat('1', 31),
            'email' => 'nope', 'timezone' => 'Mars/Olympus'];

        $errors = $this->errorCodes($this->api('PATCH', '/settings/company', $this->adminToken, $body));

        self::assertSame([
            'legal_name' => 'required',
            'trade_name' => 'required',
            'tax_id' => 'too_long',
            'email' => 'invalid',
            'timezone' => 'invalid',
        ], $errors);
    }

    public function testNeedsThePermissionToViewAndToEdit(): void
    {
        $viewer = $this->tokenWith('company', 'view');

        self::assertSame(200, $this->statusOf('GET', '/settings/company', $viewer));
        self::assertSame(403, $this->statusOf('PATCH', '/settings/company', $viewer, $this->validBody()));
        $upload = $this->sendBytes('PUT', '/settings/company/logo', $viewer, $this->png(10, 10));
        self::assertSame(403, $upload->getStatusCode());
        self::assertSame(403, $this->statusOf('GET', '/settings/company', $this->tokenWith('departments', 'view')));
    }

    public function testBrandingIsPublicAndOnlyShowsTheNameAndLogoVersion(): void
    {
        $this->api('PATCH', '/settings/company', $this->adminToken, $this->validBody());

        $response = $this->api('GET', '/branding');

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['trade_name' => 'Soltec', 'logo_version' => null], $this->json($response));
        self::assertSame(404, $this->statusOf('GET', '/branding/logo'));
    }

    public function testUploadsALogoAsAScaledWebpAndServesItWithAnEtag(): void
    {
        $response = $this->sendBytes('PUT', '/settings/company/logo', $this->adminToken, $this->png(1200, 600));

        self::assertSame(200, $response->getStatusCode());
        $version = $this->text($this->json($response), 'logo_version');
        self::assertMatchesRegularExpression('/^logo-[0-9a-f]{16}$/', $version);
        self::assertSame([$version . '.webp'], $this->brandingFiles());

        $logo = $this->api('GET', '/branding/logo');
        self::assertSame(200, $logo->getStatusCode());
        self::assertSame('image/webp', $logo->getHeaderLine('Content-Type'));
        self::assertSame('"' . $version . '"', $logo->getHeaderLine('ETag'));
        self::assertSame('public, no-cache', $logo->getHeaderLine('Cache-Control'));
        $size = getimagesizefromstring((string) $logo->getBody());
        self::assertIsArray($size);
        self::assertSame(IMAGETYPE_WEBP, $size[2]);
        self::assertSame([512, 256], [$size[0], $size[1]], 'The longer side is 512 px and the ratio is kept.');

        $cached = $this->call('GET', '/api/v1/branding/logo', ['If-None-Match' => '"' . $version . '"']);
        self::assertSame(304, $cached->getStatusCode());
        self::assertSame('', (string) $cached->getBody());

        self::assertSame($version, $this->json($this->api('GET', '/branding'))['logo_version']);
    }

    public function testReplacingTheLogoDeletesTheOldFileAndRemovingItIsIdempotent(): void
    {
        $upload = fn (string $image): array => $this->json(
            $this->sendBytes('PUT', '/settings/company/logo', $this->adminToken, $image),
        );
        $first = $upload($this->png(100, 100));
        $second = $upload($this->png(200, 100, false));

        self::assertNotSame($first['logo_version'], $second['logo_version']);
        self::assertSame([$this->text($second, 'logo_version') . '.webp'], $this->brandingFiles());

        $removed = $this->json($this->api('DELETE', '/settings/company/logo', $this->adminToken));
        self::assertNull($removed['logo_version']);
        self::assertSame([], $this->brandingFiles());
        self::assertSame(200, $this->statusOf('DELETE', '/settings/company/logo', $this->adminToken));
        self::assertSame(404, $this->statusOf('GET', '/branding/logo'));

        $audit = $this->auditEntries('company');
        self::assertCount(3, $audit, 'Two uploads and one removal; the second removal changed nothing.');
        self::assertSame(['logo_version' => null], $audit[2]['after']);
    }

    public function testRefusesWhatIsNotAnAcceptableImage(): void
    {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
        $cases = [
            'empty' => ['', 'required'],
            'svg' => [$svg, 'unsupported_type'],
            'php renamed as an image' => ['<?php system($_GET["c"]);', 'unsupported_type'],
            'a gif' => [base64_decode('R0lGODlhAQABAAAAACw=', true) ?: '', 'unsupported_type'],
            'a truncated png' => [substr($this->png(50, 50), 0, 40), 'invalid'],
            'over one megabyte' => [str_repeat('x', 1_048_577), 'too_large'],
        ];

        foreach ($cases as $label => [$bytes, $code]) {
            $response = $this->sendBytes('PUT', '/settings/company/logo', $this->adminToken, $bytes, 'image/png');
            self::assertSame(422, $response->getStatusCode(), $label);
            self::assertSame(['logo' => $code], $this->errorCodes($response), $label);
        }
        self::assertSame([], $this->brandingFiles());
    }

    public function testTheStoredFileIsReencodedSoNothingHiddenSurvives(): void
    {
        $payload = '<?php echo "owned"; ?>';
        $poisoned = $this->png(40, 40) . $payload;

        $this->sendBytes('PUT', '/settings/company/logo', $this->adminToken, $poisoned);

        $stored = (string) file_get_contents($this->storageRoot . '/storage/branding/' . $this->brandingFiles()[0]);
        self::assertStringNotContainsString('owned', $stored);
    }
}
