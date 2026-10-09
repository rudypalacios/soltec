<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel\Deploy;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Soltec\Kernel\Config;
use Soltec\Kernel\Deploy\Requirements\MailRequirements;
use Soltec\Kernel\Deploy\Requirements\ModuleRequirements;
use Soltec\Kernel\Deploy\Requirements\Requirements;
use Soltec\Kernel\Paths;
use Soltec\Tests\Unit\Kernel\Mail\FakeMailTransport;

/** The checks of the .env settings every instance has to provide. They need no database. */
final class RequirementsConfigurationTest extends TestCase
{
    private const SECRET = 'a-secret-that-must-never-appear-in-the-report-0123456789';

    private string $instance;

    protected function setUp(): void
    {
        $this->instance = sys_get_temp_dir() . '/soltec-requirements-' . bin2hex(random_bytes(4));
        mkdir($this->instance . '/api', 0777, true);
    }

    protected function tearDown(): void
    {
        foreach (['/public', '/api'] as $directory) {
            if (is_dir($this->instance . $directory)) {
                rmdir($this->instance . $directory);
            }
        }
        rmdir($this->instance);
    }

    public function testASecretThatIsPresentAndLongEnoughPasses(): void
    {
        $checks = $this->checks(['DEPLOY_TOKEN' => self::SECRET, 'JWT_SECRET' => self::SECRET], deployed: true);

        self::assertSame('pass', $checks['config.deploy_token']['status']);
        self::assertSame('pass', $checks['config.jwt_secret']['status']);
    }

    public function testAMissingOrShortSecretFailsOnADeployedInstance(): void
    {
        $checks = $this->checks(['DEPLOY_TOKEN' => 'short'], deployed: true);

        self::assertSame('fail', $checks['config.deploy_token']['status']);
        self::assertStringContainsString('shorter than 32', (string) $checks['config.deploy_token']['message']);
        self::assertSame('fail', $checks['config.jwt_secret']['status']);
        self::assertStringContainsString('is missing', (string) $checks['config.jwt_secret']['message']);
    }

    public function testOnADeveloperMachineAMissingSecretOnlyWarns(): void
    {
        $checks = $this->checks([], deployed: false);

        self::assertSame('warn', $checks['config.jwt_secret']['status']);
        self::assertSame('warn', $checks['config.deploy_token']['status']);
    }

    public function testTheReportNeverShowsTheValueOfASecret(): void
    {
        $checks = $this->checks(['DEPLOY_TOKEN' => self::SECRET, 'JWT_SECRET' => substr(self::SECRET, 0, 10)], true);

        foreach ($checks as $check) {
            self::assertStringNotContainsString(substr(self::SECRET, 0, 10), json_encode($check) ?: '');
        }
    }

    public function testAMissingAppUrlWarnsBecauseEmailsNeedIt(): void
    {
        $check = $this->checks([], deployed: true)['config.app_url'];

        self::assertSame('warn', $check['status']);
        self::assertStringContainsString('emails', (string) $check['message']);
    }

    public function testAPlainHttpsAddressPasses(): void
    {
        $check = $this->checks(['APP_URL' => 'https://host.example.com'], deployed: true)['config.app_url'];

        self::assertSame('pass', $check['status']);
    }

    /** @return iterable<string, array{string}> */
    public static function badAddresses(): iterable
    {
        yield 'trailing slash' => ['https://host.example.com/'];
        yield 'with a path' => ['https://host.example.com/app'];
        yield 'with a query' => ['https://host.example.com?x=1'];
        yield 'no scheme' => ['host.example.com'];
        yield 'another scheme' => ['ftp://host.example.com'];
        yield 'javascript' => ['javascript:alert(1)'];
        yield 'not an address' => ['not an address'];
    }

    #[DataProvider('badAddresses')]
    public function testBadAddressesWarn(string $url): void
    {
        self::assertSame('warn', $this->checks(['APP_URL' => $url], deployed: true)['config.app_url']['status']);
    }

    public function testHttpIsOnlyAcceptableOnADeveloperMachine(): void
    {
        $deployed = $this->checks(['APP_URL' => 'http://host.example.com'], deployed: true)['config.app_url'];
        $local = $this->checks(['APP_URL' => 'http://localhost:5173'], deployed: false)['config.app_url'];

        self::assertSame('warn', $deployed['status']);
        self::assertStringContainsString('HTTPS', (string) $deployed['message']);
        self::assertSame('pass', $local['status']);
    }

    /**
     * @param array<string, string> $env
     * @return array<string, array<string, string|null>>
     */
    private function checks(array $env, bool $deployed): array
    {
        // The instance counts as deployed when public/ sits next to api/.
        $public = $this->instance . '/public';
        if ($deployed && !is_dir($public)) {
            mkdir($public);
        } elseif (!$deployed && is_dir($public)) {
            rmdir($public);
        }
        $config = new Config($env);
        $requirements = new Requirements(
            $config,
            new Paths($this->instance . '/api'),
            new MailRequirements($config, new FakeMailTransport()),
            new class implements ModuleRequirements {
                public function checks(): array
                {
                    return [];
                }
            },
        );

        $byId = [];
        foreach ($requirements->evaluate($this->instance . '/public', true)->toArray()['checks'] as $check) {
            $byId[(string) $check['id']] = $check;
        }

        return $byId;
    }
}
