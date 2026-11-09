import { fitWithin, photoMetadataFrom, type PhotoPreparer } from '@soltec/shared';
import { parse } from 'exifr';

const JPEG_QUALITY = 0.85;

/** The EXIF fields the API keeps, plus the coordinates `exifr` works out of the GPS block. */
const WANTED = ['DateTimeOriginal', 'Make', 'Model'] as const;

/**
 * The name of the shrunk picture: the original's, with the extension of what it was saved as (a phone's `IMG_1.HEIC`
 * or a PNG both leave as JPEG).
 */
function jpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '').trim();
  return `${base === '' ? 'foto' : base}.jpg`;
}

/**
 * The browser's implementation of the photo port (ADR-0009): reads the EXIF before anything else, because drawing
 * the picture on a canvas drops it, and then shrinks the picture to what the server keeps. JPEG, because Safari
 * cannot be trusted to encode WebP; the server turns it into WebP.
 */
export const webPhotoPreparer: PhotoPreparer = {
  async prepare(source, name) {
    const metadata = await readMetadata(source);

    // `from-image` turns the picture upright by its orientation, which is what a person expects to see.
    const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
    try {
      const { width, height } = fitWithin(bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('The browser cannot draw the picture.');
      }
      context.drawImage(bitmap, 0, 0, width, height);
      const photo = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error('The browser cannot encode the picture.')),
          'image/jpeg',
          JPEG_QUALITY,
        );
      });
      return { photo, name: jpegName(name), metadata };
    } finally {
      bitmap.close();
    }
  },
};

async function readMetadata(source: Blob) {
  try {
    const exif = (await parse(source, {
      gps: true,
      pick: [...WANTED, 'latitude', 'longitude'],
    })) as unknown;
    return photoMetadataFrom(
      typeof exif === 'object' ? (exif as Record<string, unknown>) : undefined,
    );
  } catch {
    // A photo without readable EXIF (a screenshot, a PNG) is still a photo: it goes up without metadata.
    return undefined;
  }
}
