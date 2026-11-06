import { z } from 'zod';

export const radioStationSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  country: z.string(),
  tags: z.array(z.string()),
  codec: z.string(),
  bitrate: z.number(),
  /** The directory has a logo (an http(s) image) for the station; it is served at `/radio-logo/<uuid>` and the address stays in the main process */
  hasLogo: z.boolean().optional(),
});

export const radioTagSchema = z.object({ name: z.string(), stationCount: z.number() });

/** A value of the directory a list can be filtered by (a country, a language, a codec): what is sent, what is shown and how many stations have it */
export const radioOptionSchema = z.object({ value: z.string(), name: z.string(), stationCount: z.number() });

export const radioOptionKindSchema = z.enum(['countries', 'languages', 'codecs']);

export type RadioStation = z.infer<typeof radioStationSchema>;
export type RadioTag = z.infer<typeof radioTagSchema>;
export type RadioOption = z.infer<typeof radioOptionSchema>;
export type RadioOptionKind = z.infer<typeof radioOptionKindSchema>;
