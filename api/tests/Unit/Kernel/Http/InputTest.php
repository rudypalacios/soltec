<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel\Http;

use PHPUnit\Framework\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;
use Soltec\Kernel\Http\Input;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Uuid;

final class InputTest extends TestCase
{
    public function testReportsEveryWrongFieldAtOnce(): void
    {
        $input = $this->body(['name' => '', 'email' => 'nope', 'role_ids' => ['x']]);
        $input->text('name', 1, 150);
        $input->email('email');
        $input->uuidList('role_ids');
        $input->secret('initial_password');

        $this->assertErrors($input, [
            ['field' => 'name', 'code' => 'required'],
            ['field' => 'email', 'code' => 'invalid'],
            ['field' => 'role_ids', 'code' => 'invalid'],
            ['field' => 'initial_password', 'code' => 'required'],
        ]);
    }

    public function testTrimsTextAndLowercasesEmails(): void
    {
        $input = $this->body(['name' => '  Ana  ', 'email' => ' Ana@Example.COM ']);

        self::assertSame('Ana', $input->text('name', 1, 150));
        self::assertSame('ana@example.com', $input->email('email'));
        $input->done();
    }

    public function testCountsLengthInCharactersNotBytes(): void
    {
        $input = $this->body(['name' => str_repeat('ñ', 150)]);

        self::assertSame(str_repeat('ñ', 150), $input->text('name', 1, 150));
        $input->done();
    }

    public function testRejectsTextThatIsTooLongOrNotAString(): void
    {
        $input = $this->body(['name' => str_repeat('a', 151), 'other' => 5]);
        $input->text('name', 1, 150);
        $input->text('other', 1, 10);

        $this->assertErrors($input, [
            ['field' => 'name', 'code' => 'too_long'],
            ['field' => 'other', 'code' => 'invalid'],
        ]);
    }

    public function testReadsWholeNumbersOnlyAsJsonNumbers(): void
    {
        $input = $this->body(['days' => 30, 'text' => '30', 'float' => 1.5, 'low' => 0, 'missing' => null]);

        self::assertSame(30, $input->integer('days', 1, 365));
        $input->integer('text', 1, 365);
        $input->integer('float', 1, 365);
        $input->integer('low', 1, 365);
        $input->integer('missing', 1, 365);

        $this->assertErrors($input, [
            ['field' => 'text', 'code' => 'invalid'],
            ['field' => 'float', 'code' => 'invalid'],
            ['field' => 'low', 'code' => 'out_of_range'],
            ['field' => 'missing', 'code' => 'required'],
        ]);
    }

    public function testRatesAreStringsFromZeroUpToOneAndComeBackWithFiveDecimals(): void
    {
        $input = $this->body([
            'a' => '0.12', 'b' => '0', 'c' => '0.99999', 'd' => '1', 'e' => '0.123456', 'f' => 0.12, 'g' => '-0.1',
            'h' => '.5', 'i' => '1.5',
        ]);

        self::assertSame('0.12000', $input->rate('a'));
        self::assertSame('0.00000', $input->rate('b'));
        self::assertSame('0.99999', $input->rate('c'));
        $input->rate('d');
        $input->rate('e');
        $input->rate('f');
        $input->rate('g');
        $input->rate('h');
        $input->rate('i');

        $this->assertErrors($input, [
            ['field' => 'd', 'code' => 'out_of_range'],
            ['field' => 'e', 'code' => 'invalid'],
            ['field' => 'f', 'code' => 'invalid'],
            ['field' => 'g', 'code' => 'out_of_range'],
            ['field' => 'h', 'code' => 'invalid'],
            ['field' => 'i', 'code' => 'out_of_range'],
        ]);
    }

    public function testSecretsAreNeverTrimmed(): void
    {
        $input = $this->body(['password' => '  spaced  ']);

        self::assertSame('  spaced  ', $input->secret('password'));
    }

    public function testSecretsCountBytes(): void
    {
        $input = $this->body(['password' => str_repeat('ñ', 37)]);
        $input->secret('password');

        $this->assertErrors($input, [['field' => 'password', 'code' => 'too_long']]);
    }

    public function testUuidListsMustBeDistinctValidIds(): void
    {
        $id = Uuid::v7();
        $ok = $this->body(['role_ids' => [$id]]);
        self::assertSame([$id], $ok->uuidList('role_ids'));
        $ok->done();

        foreach ([[$id, $id], [], 'string', [5]] as $value) {
            $bad = $this->body(['role_ids' => $value]);
            $bad->uuidList('role_ids');
            $this->assertErrors($bad, null);
        }
    }

    public function testVersionMustBeAPositiveInteger(): void
    {
        foreach (['1', 0, -1, 1.5, null] as $value) {
            $input = $this->body(['version' => $value]);
            $input->version();
            $this->assertErrors($input, null);
        }
        self::assertSame(3, $this->body(['version' => 3])->version());
    }

    public function testChoiceRejectsValuesOutsideTheList(): void
    {
        $input = $this->body(['status' => 'deleted']);
        $input->choice('status', ['active', 'inactive']);

        $this->assertErrors($input, [['field' => 'status', 'code' => 'invalid']]);
        self::assertSame('active', $this->body([])->choice('status', ['active', 'inactive'], 'active'));
    }

    public function testNestedErrorsCarryTheirPrefix(): void
    {
        $input = $this->body([]);
        $device = Input::nested('device', ['platform' => 'palm']);
        $device->choice('platform', ['web', 'android', 'ios']);
        $input->absorb($device);

        $this->assertErrors($input, [['field' => 'device.platform', 'code' => 'invalid']]);
    }

    public function testPaginationDefaultsAndBounds(): void
    {
        $default = Input::query($this->request('GET', []))->pagination();
        self::assertSame([1, 25, 0], [$default->page, $default->perPage, $default->offset()]);

        $third = Input::query($this->request('GET', ['page' => '3', 'per_page' => '10']))->pagination();
        self::assertSame(20, $third->offset());

        foreach ([['page' => '0'], ['per_page' => '101'], ['per_page' => 'x']] as $query) {
            $input = Input::query($this->request('GET', $query));
            $input->pagination();
            $this->assertErrors($input, null);
        }
    }

    public function testTheBodyMustBeAJsonObject(): void
    {
        foreach ([null, [1, 2]] as $parsed) {
            try {
                Input::body($this->request('POST', [])->withParsedBody($parsed));
                self::fail('A body that is not an object must be rejected.');
            } catch (ValidationException $error) {
                self::assertSame([['field' => 'body', 'code' => 'invalid']], $error->errors);
            }
        }
        $this->body([])->done();
    }

    /** @param array<array-key, mixed> $data */
    private function body(array $data): Input
    {
        return Input::body($this->request('POST', [])->withParsedBody($data));
    }

    /** @param array<string, string> $query */
    private function request(string $method, array $query): \Psr\Http\Message\ServerRequestInterface
    {
        return (new ServerRequestFactory())->createServerRequest($method, '/')->withQueryParams($query);
    }

    /** @param list<array{field: string, code: string}>|null $expected null only checks that something failed */
    private function assertErrors(Input $input, ?array $expected): void
    {
        try {
            $input->done();
            self::fail('Expected a validation failure.');
        } catch (ValidationException $error) {
            self::assertSame(422, $error->status);
            if ($expected !== null) {
                self::assertSame($expected, $error->errors);
            }
        }
    }
}
