import { z } from 'zod';

/** What is stored of the measurement of a track as JSON, read for one track at a time. See docs/app/loudness-measurement.md */
export const loudnessAnalysisSchema = z.object({
  /** The version of the algorithm and of this shape: a row of an older one is measured again */
  v: z.number(),
  sampleRate: z.number(),
  channels: z.number(),
  integratedLufs: z.number(),
  loudnessRange: z.number(),
  /** A ratio of full scale (1 is 0 dBFS) that can be above 1 for a file that clips; the highest sample, not the true peak */
  samplePeak: z.number(),
  /** The loudness of the track over its length, a point for the same share of it, in tenths of a dB (LUFS) */
  shortTerm: z.array(z.number()),
  /** The loudness of the 400 ms blocks above the absolute gate: how many fall into each bin of `bin` LU, keyed by the bin number (`-182` is from -18.2 LUFS up) */
  histogram: z.object({ bin: z.number(), counts: z.record(z.string(), z.number()) }),
});

/**
 * What the measuring page answers. Undecodable is a file the browser cannot decode, unreadable one that could not be fetched (a drive that went away),
 * which is tried again later; silent has no block above the absolute gate
 */
export const measureResultSchema = z.discriminatedUnion('outcome', [
  z.object({ id: z.number(), outcome: z.literal('measured'), analysis: loudnessAnalysisSchema, trackGain: z.number(), trackPeak: z.number() }),
  z.object({ id: z.number(), outcome: z.enum(['silent', 'undecodable', 'unreadable', 'too-large']) }),
]);

/** How far the measurement of the library is: the tracks, those with a measurement and those that could not be measured. The rest wait for it */
export const loudnessProgressSchema = z.object({ total: z.number(), measured: z.number(), failed: z.number() });

export type LoudnessAnalysis = z.infer<typeof loudnessAnalysisSchema>;
export type MeasureResult = z.infer<typeof measureResultSchema>;
export type LoudnessProgress = z.infer<typeof loudnessProgressSchema>;
