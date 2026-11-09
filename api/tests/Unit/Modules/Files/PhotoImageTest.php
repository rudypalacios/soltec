<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Modules\Files;

use PHPUnit\Framework\TestCase;
use Soltec\Kernel\Http\ValidationException;
use Soltec\Modules\Files\Application\PhotoImage;

final class PhotoImageTest extends TestCase
{
    public function testMakesTheNormalImageAndTheThumbnailFromOnePhoto(): void
    {
        $photo = PhotoImage::process($this->png(4000, 3000));

        self::assertSame([1600, 1200], [$photo['width'], $photo['height']]);
        self::assertSame([1600, 1200], $this->sizeOf($photo['normal']));
        self::assertSame([320, 240], $this->sizeOf($photo['thumbnail']));
        self::assertLessThan(strlen($photo['normal']), strlen($photo['thumbnail']));
    }

    public function testAPortraitKeepsItsRatioOnTheLongerSide(): void
    {
        $photo = PhotoImage::process($this->png(1200, 2400));

        self::assertSame([800, 1600], $this->sizeOf($photo['normal']));
        self::assertSame([160, 320], $this->sizeOf($photo['thumbnail']));
    }

    public function testASmallPhotoIsNeverScaledUp(): void
    {
        $photo = PhotoImage::process($this->png(300, 200));

        self::assertSame([300, 200], $this->sizeOf($photo['normal']));
        self::assertSame([300, 200], $this->sizeOf($photo['thumbnail']));
    }

    public function testRefusesAPhotoWithTooManyPixelsEvenWhenTheFileIsSmall(): void
    {
        // Sixteen million and one pixels of one colour compress to a few kilobytes but would need 64 MB to decode.
        $this->assertRejected($this->png(4001, 4000), 'too_large');
    }

    public function testRefusesWhatIsNotAPhoto(): void
    {
        $this->assertRejected('', 'required');
        $this->assertRejected('<svg xmlns="http://www.w3.org/2000/svg"/>', 'unsupported_type');
        $this->assertRejected(str_repeat('a', PhotoImage::MAX_BYTES + 1), 'too_large');
        $this->assertRejected(substr($this->png(50, 50), 0, 50), 'invalid');
    }

    private function assertRejected(string $bytes, string $code): void
    {
        try {
            PhotoImage::process($bytes);
            self::fail('The upload should have been rejected as ' . $code);
        } catch (ValidationException $failure) {
            self::assertSame([['field' => 'file', 'code' => $code]], $failure->errors);
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

    private function png(int $width, int $height): string
    {
        $image = imagecreatetruecolor(max(1, $width), max(1, $height));
        imagefill($image, 0, 0, (int) imagecolorallocate($image, 10, 100, 200));
        ob_start();
        imagepng($image, null, 9);

        return (string) ob_get_clean();
    }
}
