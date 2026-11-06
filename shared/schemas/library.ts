import { z } from 'zod';

const optionalNumber = z.number().nullish();

// the text columns of the library can hold NULL (a track from before the tag was read), which the player takes as empty
export const text = z
  .string()
  .nullable()
  .transform((value) => value ?? '');
export const textOrNumber = z
  .union([z.string(), z.number()])
  .nullable()
  .transform((value) => value ?? '');

/** What a file is encoded as; a row from before the format was read, or a stream that does not tell, has none. The flags are 0 or 1 as the library stores them. */
const audioFormatSchema = z.object({
  codec: z.string().nullable(),
  bitDepth: z.number().nullable(),
  sampleRate: z.number().nullable(),
  /** Bits per second */
  bitrate: z.number().nullable(),
  vbr: z.number().nullable(),
  lossless: z.number().nullable(),
});

/** The ReplayGain of a file as its tags say; a file without the tag has none. A gain is in dB, a peak is a ratio of full scale (1 is 0 dBFS). */
const loudnessSchema = z.object({
  trackGain: z.number().nullable(),
  albumGain: z.number().nullable(),
  trackPeak: z.number().nullable(),
  albumPeak: z.number().nullable(),
});

export const trackSchema = z.object({
  path: z.string(),
  artist: text,
  album: text,
  title: text,
  year: textOrNumber,
  track: textOrNumber,
  disk: textOrNumber,
  genre: text,
  picture: z.string().nullable(),
  duration: z.number().nullable(),
  /** The artist the album is listed under, a row from before it was read has none */
  albumArtist: z.string().nullish(),
  /** The modification time (ms) and the size (bytes) of the file when its tags were read, a row from before they were kept has none */
  fileModified: optionalNumber,
  fileSize: optionalNumber,
  ...audioFormatSchema.partial().shape,
  ...loudnessSchema.partial().shape,
});

export const albumSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  path: z.string(),
  artist: text,
  cover: z.string().nullable(),
  duration: z.number().nullable(),
  year: textOrNumber,
  /** The main colour of the cover as `#rrggbb`, none when it has not been picked yet or the cover is grey */
  accent: z.string().optional(),
  trackCount: z.number(),
  ...audioFormatSchema.partial().shape,
});

export const groupSummarySchema = z.object({
  /** The name as the library compares it, empty for the tracks that have none */
  key: z.string(),
  /** The name as it is written on a track, empty for the tracks that have none */
  name: z.string(),
  albumCount: z.number(),
  trackCount: z.number(),
  cover: z.string().nullable(),
  /** The main colour of the cover as `#rrggbb`, none for a photo, when it has not been picked yet or when the cover is grey */
  accent: z.string().optional(),
  /** Up to three covers of its albums, for the genres only (they have no photo) */
  covers: z.array(z.string()),
});

/** The format and the loudness of a track as the player takes them */
export const trackFormatSchema = audioFormatSchema.extend(loudnessSchema.shape);

export type AudioFormat = z.infer<typeof audioFormatSchema>;
export type Loudness = z.infer<typeof loudnessSchema>;
export type Track = z.infer<typeof trackSchema>;
export type AlbumSummary = z.infer<typeof albumSummarySchema>;
export type GroupSummary = z.infer<typeof groupSummarySchema>;
