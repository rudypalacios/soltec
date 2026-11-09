import { describe, expect, it } from 'vitest';
import { fitWithin, photoMetadataFrom } from './photo';

describe('fitWithin', () => {
  it('scales a picture down to the longer side and keeps its ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(1000, 500, 320)).toEqual({ width: 320, height: 160 });
  });

  it('never scales up and never returns an empty side', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(16000, 1)).toEqual({ width: 1600, height: 1 });
  });
});

describe('photoMetadataFrom', () => {
  it('keeps what the API accepts', () => {
    const exif = {
      DateTimeOriginal: new Date('2026-10-30T14:05:09.000Z'),
      Make: ' Google ',
      Model: 'Pixel 7',
      latitude: 14.6349149,
      longitude: -90.5068824,
      Orientation: 6,
    };

    expect(photoMetadataFrom(exif)).toEqual({
      taken_at: '2026-10-30T14:05:09.000Z',
      latitude: 14.6349149,
      longitude: -90.5068824,
      device_make: 'Google',
      device_model: 'Pixel 7',
    });
  });

  it('leaves out a field that is wrong instead of failing', () => {
    expect(
      photoMetadataFrom({
        DateTimeOriginal: new Date('nonsense'),
        Make: 42,
        Model: '   ',
        latitude: 91,
        longitude: 0,
      }),
    ).toBeUndefined();
    expect(photoMetadataFrom({ latitude: '14.6', longitude: '-90.5' })).toBeUndefined();
  });

  it('sends the coordinates together or not at all', () => {
    expect(photoMetadataFrom({ latitude: 14.6, Make: 'Apple' })).toEqual({ device_make: 'Apple' });
  });

  it('cuts a long name to what the API takes', () => {
    expect(photoMetadataFrom({ Make: 'a'.repeat(300) })?.device_make).toHaveLength(100);
  });

  it('has nothing to say about a photo without EXIF', () => {
    expect(photoMetadataFrom(undefined)).toBeUndefined();
    expect(photoMetadataFrom(null)).toBeUndefined();
    expect(photoMetadataFrom({})).toBeUndefined();
  });
});
