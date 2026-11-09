import type { PhotoMetadata } from '../domain/photo';

/** A photo ready to upload: the picture already shrunk, and what the phone wrote in it before that. */
export interface PreparedPhoto {
  photo: Blob;
  /** The name to show, with the extension of the file the picture was saved as. */
  name: string;
  metadata?: PhotoMetadata;
}

/**
 * Turns a photo the person picked into something worth uploading (ADR-0009): reads its EXIF first, because shrinking
 * the picture drops it, and then shrinks it to what the server keeps. Each platform implements it (a canvas on the
 * web, the image manipulator on mobile); the screens never touch the device's image APIs.
 */
export interface PhotoPreparer {
  prepare(source: Blob, name: string): Promise<PreparedPhoto>;
}
