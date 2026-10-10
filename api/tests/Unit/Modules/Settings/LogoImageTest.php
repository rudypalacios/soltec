<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Modules\Settings;

use PHPUnit\Framework\TestCase;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Modules\Settings\Application\LogoImage;

final class LogoImageTest extends TestCase
{
    public function testScalesDownKeepingTheRatioAndNeverScalesUp(): void
    {
        self::assertSame([512, 128], $this->sizeOf(LogoImage::toWebp($this->png(2048, 512))));
        self::assertSame([64, 32], $this->sizeOf(LogoImage::toWebp($this->png(64, 32))));
    }

    public function testKeepsTheTransparency(): void
    {
        $webp = LogoImage::toWebp($this->png(40, 40, alpha: 100));

        $image = imagecreatefromstring($webp);
        self::assertNotFalse($image);
        $alpha = (imagecolorat($image, 5, 5) >> 24) & 0x7F;
        self::assertGreaterThan(60, $alpha, 'A semi-transparent pixel stays semi-transparent.');
    }

    public function testAcceptsJpegAndWebpToo(): void
    {
        $canvas = imagecreatetruecolor(30, 30);
        ob_start();
        imagejpeg($canvas);
        $jpeg = (string) ob_get_clean();
        ob_start();
        imagewebp($canvas);
        $webp = (string) ob_get_clean();

        self::assertSame([30, 30], $this->sizeOf(LogoImage::toWebp($jpeg)));
        self::assertSame([30, 30], $this->sizeOf(LogoImage::toWebp($webp)));
    }

    public function testRefusesAnImageWithTooManyPixelsEvenWhenTheFileIsSmall(): void
    {
        // 4000 x 4000 of one colour compresses to a few kilobytes but would need 64 MB to decode.
        $this->assertRejected($this->png(4000, 4000), 'too_large');
    }

    public function testRefusesWhatIsNotAnImage(): void
    {
        $this->assertRejected('', 'required');
        $this->assertRejected('<svg xmlns="http://www.w3.org/2000/svg"/>', 'unsupported_type');
        $this->assertRejected("GIF89a\x01\x00\x01\x00\x00\x00\x00;", 'unsupported_type');
        $this->assertRejected(str_repeat('a', LogoImage::MAX_BYTES + 1), 'too_large');
        $this->assertRejected(substr($this->png(50, 50), 0, 50), 'invalid');
    }

    private function assertRejected(string $bytes, string $code): void
    {
        try {
            LogoImage::toWebp($bytes);
            self::fail('The upload should have been rejected as ' . $code);
        } catch (ValidationException $failure) {
            self::assertSame([['field' => 'logo', 'code' => $code]], $failure->errors);
        }
    }

    /** @return array{int, int} */
    private function sizeOf(string $webp): array
    {
        $size = getimagesizefromstring($webp);
        self::assertIsArray($size);
        self::assertSame(IMAGETYPE_WEBP, $size[2]);

        return [$size[0], $size[1]];
    }

    private function png(int $width, int $height, int $alpha = 0): string
    {
        $image = imagecreatetruecolor(max(1, $width), max(1, $height));
        imagealphablending($image, false);
        imagesavealpha($image, true);
        imagefill($image, 0, 0, (int) imagecolorallocatealpha($image, 10, 100, 200, max(0, min(127, $alpha))));
        ob_start();
        imagepng($image, null, 9);

        return (string) ob_get_clean();
    }
}
