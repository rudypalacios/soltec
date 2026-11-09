import type { components } from '../api/generated/schema';

export type PhotoMetadata = components['schemas']['PhotoMetadata'];

/** The longer side the server keeps the normal image at (`PhotoImage::NORMAL_SIDE`): sending more is wasted bytes. */
export const PHOTO_MAX_SIDE = 1600;

/** The size of a picture scaled down to fit `maxSide` on its longer side. It never scales up. */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number = PHOTO_MAX_SIDE,
): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** What an EXIF reader returns, before anything is trusted: every field may be missing or the wrong type. */
export interface ExifReading {
  DateTimeOriginal?: unknown;
  Make?: unknown;
  Model?: unknown;
  latitude?: unknown;
  longitude?: unknown;
}

const isCoordinate = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

const cleanText = (value: unknown): string | undefined => {
  const text = typeof value === 'string' ? value.trim().slice(0, 100) : '';
  return text === '' ? undefined : text;
};

/**
 * The metadata to send with a photo, from what the phone wrote in it. Only what the API accepts, and only when it
 * is valid: a wrong field is left out instead of making the upload fail, because the photo matters more than its
 * metadata. The coordinates go together or not at all, as the API requires.
 */
export function photoMetadataFrom(exif: ExifReading | null | undefined): PhotoMetadata | undefined {
  if (!exif) {
    return undefined;
  }
  const metadata: PhotoMetadata = {};
  const taken = exif.DateTimeOriginal;
  if (taken instanceof Date && !Number.isNaN(taken.getTime())) {
    metadata.taken_at = taken.toISOString();
  }
  if (isCoordinate(exif.latitude, 90) && isCoordinate(exif.longitude, 180)) {
    metadata.latitude = exif.latitude;
    metadata.longitude = exif.longitude;
  }
  const make = cleanText(exif.Make);
  if (make) {
    metadata.device_make = make;
  }
  const model = cleanText(exif.Model);
  if (model) {
    metadata.device_model = model;
  }
  return Object.keys(metadata).length === 0 ? undefined : metadata;
}
