<?php

declare(strict_types=1);

namespace Soltec\Modules\Settings\Application;

use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Image\WebpImage;

/** Turns an uploaded image into the logo the system stores: a WebP no larger than 512 px on its longer side. */
final class LogoImage
{
    public const MAX_BYTES = 1_048_576;
    public const MAX_SIDE = 512;
    private const MAX_PIXELS = 8_000_000;
    private const QUALITY = 90;

    /**
     * @return string the WebP bytes
     * @throws ValidationException field `logo`: `required`, `too_large`, `unsupported_type` or `invalid`
     */
    public static function toWebp(string $bytes): string
    {
        return WebpImage::decode($bytes, 'logo', self::MAX_BYTES, self::MAX_PIXELS)
            ->resized(self::MAX_SIDE, self::QUALITY, 'logo');
    }
}
