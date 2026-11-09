<?php

declare(strict_types=1);

namespace Soltec\Kernel\Image;

use GdImage;
use Soltec\Kernel\Http\ValidationException;

/**
 * An uploaded image decoded once, from which WebP files of any size are encoded. The upload is identified by its
 * content (never by the type the client declares) and always decoded and encoded again, which drops metadata and
 * anything hidden after the image data. SVG is refused on purpose: a vector file served from the application's own
 * origin can carry scripts.
 */
final class WebpImage
{
    private function __construct(
        private readonly GdImage $source,
        public readonly int $width,
        public readonly int $height,
    ) {
    }

    /**
     * Decoding allocates width x height x 4 bytes, so `$maxPixels` bounds the memory a small file can ask for.
     *
     * @param string $field the field the errors are reported under
     * @throws ValidationException `required`, `too_large`, `unsupported_type` (not PNG, JPEG or WebP) or `invalid`
     */
    public static function decode(string $bytes, string $field, int $maxBytes, int $maxPixels): self
    {
        if ($bytes === '') {
            throw ValidationException::field($field, 'required');
        }
        if (strlen($bytes) > $maxBytes) {
            throw ValidationException::field($field, 'too_large');
        }

        $info = @getimagesizefromstring($bytes);
        if ($info === false || !in_array($info[2], [IMAGETYPE_PNG, IMAGETYPE_JPEG, IMAGETYPE_WEBP], true)) {
            throw ValidationException::field($field, 'unsupported_type');
        }
        [$width, $height] = $info;
        if ($width < 1 || $height < 1 || $width * $height > $maxPixels) {
            throw ValidationException::field($field, 'too_large');
        }

        $source = @imagecreatefromstring($bytes);
        if ($source === false) {
            throw ValidationException::field($field, 'invalid');
        }

        return new self($source, $width, $height);
    }

    /**
     * The size of the picture scaled down to fit `$maxSide` on its longer side. It never scales up.
     *
     * @return array{int<1, max>, int<1, max>}
     */
    public function scaledSize(int $maxSide): array
    {
        $scale = min(1, $maxSide / max($this->width, $this->height));

        return [max(1, (int) round($this->width * $scale)), max(1, (int) round($this->height * $scale))];
    }

    /**
     * @param string $field the field an encoding failure is reported under
     * @return string the WebP bytes
     * @throws ValidationException `invalid` when GD cannot encode it
     */
    public function resized(int $maxSide, int $quality, string $field): string
    {
        [$targetWidth, $targetHeight] = $this->scaledSize($maxSide);

        // A fresh true-colour canvas keeps the transparency of PNG and WebP and flattens palette images.
        $canvas = imagecreatetruecolor($targetWidth, $targetHeight);
        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);
        imagefill($canvas, 0, 0, (int) imagecolorallocatealpha($canvas, 0, 0, 0, 127));
        imagecopyresampled(
            $canvas,
            $this->source,
            0,
            0,
            0,
            0,
            $targetWidth,
            $targetHeight,
            $this->width,
            $this->height,
        );

        ob_start();
        $encoded = imagewebp($canvas, null, $quality);
        $webp = (string) ob_get_clean();
        if (!$encoded || $webp === '') {
            throw ValidationException::field($field, 'invalid');
        }

        return $webp;
    }
}
