<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Application;

use Soltec\Kernel\Http\ValidationException;

/**
 * Turns an uploaded image into the logo the system stores: a WebP no larger than 512 px on its longer side.
 *
 * The upload is identified by its content (never by the type the client declares) and always decoded and encoded
 * again, which drops metadata and anything hidden after the image data. SVG is refused on purpose: a vector file
 * served from the application's own origin can carry scripts.
 */
final class LogoImage
{
    public const MAX_BYTES = 1_048_576;
    public const MAX_SIDE = 512;
    /** Decoding allocates width x height x 4 bytes, so a "small" file can still be a memory bomb. */
    private const MAX_PIXELS = 8_000_000;
    private const QUALITY = 90;

    /**
     * @return string the WebP bytes
     * @throws ValidationException field `logo`: `required`, `too_large`, `unsupported_type` or `invalid`
     */
    public static function toWebp(string $bytes): string
    {
        if ($bytes === '') {
            throw ValidationException::field('logo', 'required');
        }
        if (strlen($bytes) > self::MAX_BYTES) {
            throw ValidationException::field('logo', 'too_large');
        }

        $info = @getimagesizefromstring($bytes);
        if ($info === false || !in_array($info[2], [IMAGETYPE_PNG, IMAGETYPE_JPEG, IMAGETYPE_WEBP], true)) {
            throw ValidationException::field('logo', 'unsupported_type');
        }
        [$width, $height] = $info;
        if ($width < 1 || $height < 1 || $width * $height > self::MAX_PIXELS) {
            throw ValidationException::field('logo', 'too_large');
        }

        $source = @imagecreatefromstring($bytes);
        if ($source === false) {
            throw ValidationException::field('logo', 'invalid');
        }

        $scale = min(1, self::MAX_SIDE / max($width, $height));
        $targetWidth = max(1, (int) round($width * $scale));
        $targetHeight = max(1, (int) round($height * $scale));

        // A fresh true-colour canvas keeps the transparency of PNG and WebP and flattens palette images.
        $canvas = imagecreatetruecolor($targetWidth, $targetHeight);
        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);
        imagefill($canvas, 0, 0, (int) imagecolorallocatealpha($canvas, 0, 0, 0, 127));
        imagecopyresampled($canvas, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $width, $height);

        ob_start();
        $encoded = imagewebp($canvas, null, self::QUALITY);
        $webp = (string) ob_get_clean();
        if (!$encoded || $webp === '') {
            throw ValidationException::field('logo', 'invalid');
        }

        return $webp;
    }
}
