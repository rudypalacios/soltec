<?php

declare(strict_types=1);

namespace Soltec\Modules\Files\Application;

use Soltec\Kernel\Http\ValidationException;
use Soltec\Kernel\Image\WebpImage;

/**
 * Turns an uploaded photo into the two WebP files the system keeps (ADR-0009): the normal one, 1600 px on its longer
 * side, and a 320 px thumbnail. The photo is decoded once.
 */
final class PhotoImage
{
    public const MAX_BYTES = 10_485_760;
    /** Twelve megapixels is a phone photo; a 16 MP decode takes 64 MB of the 128 MB the host allows. */
    public const MAX_PIXELS = 16_000_000;
    public const NORMAL_SIDE = 1600;
    public const THUMBNAIL_SIDE = 320;
    private const NORMAL_QUALITY = 80;
    private const THUMBNAIL_QUALITY = 75;
    private const FIELD = 'file';

    /**
     * @return array{normal: string, thumbnail: string, width: int, height: int} the WebP bytes of both sizes and the
     *     dimensions of the normal one
     * @throws ValidationException field `file`: `required`, `too_large`, `unsupported_type` or `invalid`
     */
    public static function process(string $bytes): array
    {
        $image = WebpImage::decode($bytes, self::FIELD, self::MAX_BYTES, self::MAX_PIXELS);
        [$width, $height] = $image->scaledSize(self::NORMAL_SIDE);

        return [
            'normal' => $image->resized(self::NORMAL_SIDE, self::NORMAL_QUALITY, self::FIELD),
            'thumbnail' => $image->resized(self::THUMBNAIL_SIDE, self::THUMBNAIL_QUALITY, self::FIELD),
            'width' => $width,
            'height' => $height,
        ];
    }
}
