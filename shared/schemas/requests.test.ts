import { describe, expect, it } from 'vitest';
import {
  addedFilesSchema,
  artistNamesSchema,
  artistPhotoChangeSchema,
  artistPhotoSearchSchema,
  enabledRequestSchema,
  prioritiseLoudnessSchema,
  rescanRequestSchema,
  savedSettingsSchema,
} from './requests';
import { readMainSettings } from './settings';
import { loudnessAnalysisSchema, measureResultSchema } from './loudness';
import { messageSchemas } from './messages';

describe('requests', () => {
  it('keeps the dropped files that have a path and a time', () => {
    expect(addedFilesSchema.parse([{ path: '/a', lastModified: 1, name: 'a' }, { path: '/b' }, 'x', null])).toEqual([{ path: '/a', lastModified: 1 }]);
    expect(addedFilesSchema.parse('nothing')).toEqual([]);
  });

  it('asks to measure the first 50 tracks that are given, and nothing from a message of another shape', () => {
    const paths = [...Array(60).keys()].map((index) => `/music/${index}.flac`);

    expect(prioritiseLoudnessSchema.parse({ paths }).paths).toEqual(paths.slice(0, 50));
    expect(prioritiseLoudnessSchema.safeParse({ paths: [1] }).success).toBe(false);
    expect(prioritiseLoudnessSchema.safeParse(undefined).success).toBe(false);
  });

  it('forces a rescan only when the message says so', () => {
    expect(rescanRequestSchema.parse({ forced: true })).toBe(true);
    expect(rescanRequestSchema.parse({ forced: 1 })).toBe(false);
    expect(rescanRequestSchema.parse(undefined)).toBe(false);
  });

  it('names the field of a switch that is not a boolean', () => {
    expect(enabledRequestSchema.safeParse({ enabled: 'yes' }).error?.issues[0].path).toEqual(['enabled']);
  });

  it('keeps the artists with a key and a name, up to 200', () => {
    const artists = [...Array.from({ length: 250 }, (_, index) => ({ key: `k${index}`, name: 'n' })), { key: 1 }];

    expect(artistNamesSchema.parse({ artists })).toHaveLength(200);
    expect(artistNamesSchema.parse({ artists: 'x' })).toEqual([]);
  });

  it('reads a change of the photo of an artist, and a picture to download only from the servers of Deezer', () => {
    const picture = 'https://cdn-images.dzcdn.net/images/artist/x/500x500.jpg';

    expect(artistPhotoChangeSchema.parse({ key: 'adam', change: 'reset' })).toEqual({ key: 'adam', change: 'reset' });
    expect(artistPhotoChangeSchema.parse({ key: 'adam', change: 'download', picture })).toEqual({ key: 'adam', change: 'download', picture });
    expect(artistPhotoChangeSchema.safeParse({ key: '', change: 'pick' }).success).toBe(false);
    expect(artistPhotoChangeSchema.safeParse({ key: 'adam', change: 'delete' }).success).toBe(false);
    expect(artistPhotoChangeSchema.safeParse({ key: 'adam', change: 'download' }).success).toBe(false);
    ['http://cdn-images.dzcdn.net/a.jpg', 'https://example.com/a.jpg', 'https://dzcdn.net.example.com/a.jpg', 'file:///etc/passwd'].forEach((url) =>
      expect(artistPhotoChangeSchema.safeParse({ key: 'adam', change: 'download', picture: url }).success).toBe(false)
    );
  });

  it('reads the text of a search of photos trimmed, not empty and not too long', () => {
    expect(artistPhotoSearchSchema.parse({ query: '  Adam ' })).toEqual({ query: 'Adam' });
    expect(artistPhotoSearchSchema.safeParse({ query: '   ' }).success).toBe(false);
    expect(artistPhotoSearchSchema.safeParse({ query: 'a'.repeat(101) }).success).toBe(false);
  });

  it('takes settings that are an object and nothing else', () => {
    expect(savedSettingsSchema.safeParse({ volume: 1 }).success).toBe(true);
    expect(savedSettingsSchema.safeParse('text').success).toBe(false);
  });
});

describe('settings the main process reads', () => {
  it('reads the keys it knows and drops the ones of the wrong type', () => {
    expect(readMainSettings({ language: 'hu', theme: { mode: 'dark' }, watchFolders: false, measureLoudness: 'no' })).toEqual({
      language: 'hu',
      theme: { mode: 'dark' },
      watchFolders: false,
      measureLoudness: undefined,
    });
    expect(readMainSettings(undefined)).toEqual({ language: undefined, theme: undefined, watchFolders: undefined, measureLoudness: undefined });
  });
});

describe('loudness', () => {
  const analysis = {
    v: 1,
    sampleRate: 44100,
    channels: 2,
    integratedLufs: -14,
    loudnessRange: 5,
    samplePeak: 0.9,
    shortTerm: [1],
    histogram: { bin: 5, counts: { '-182': 3 } },
  };

  it('reads an analysis and names the field that is wrong', () => {
    expect(loudnessAnalysisSchema.parse(analysis)).toEqual(analysis);
    expect(loudnessAnalysisSchema.safeParse({ ...analysis, histogram: { bin: 5, counts: { a: 'x' } } }).error?.issues[0].path).toEqual([
      'histogram',
      'counts',
      'a',
    ]);
  });

  it('wants the analysis of a measured result', () => {
    expect(measureResultSchema.safeParse({ id: 1, outcome: 'measured' }).success).toBe(false);
    expect(measureResultSchema.safeParse({ id: 1, outcome: 'silent' }).success).toBe(true);
    expect(measureResultSchema.safeParse({ id: 1, outcome: 'crashed' }).success).toBe(false);
  });
});

describe('messages to the page', () => {
  it('reads a folder without a time as 0 and refuses a state of the wrong type', () => {
    expect(messageSchemas.STORE_FOLDERS.parse({ folders: [{ path: '/m', lastModified: null }] })).toEqual({ folders: [{ path: '/m', lastModified: 0 }] });
    expect(messageSchemas.SET_PLAYING.safeParse({ isPlaying: 'yes' }).success).toBe(false);
  });
});
