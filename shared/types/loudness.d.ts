/** What is stored of the measurement of a track as JSON, read for one track at a time. See docs/app/loudness-measurement.md */
export interface LoudnessAnalysis {
  /** The version of the algorithm and of this shape: a row of an older one is measured again */
  v: number;
  sampleRate: number;
  channels: number;
  integratedLufs: number;
  loudnessRange: number;
  /** A ratio of full scale (1 is 0 dBFS) that can be above 1 for a file that clips; the highest sample, not the true peak */
  samplePeak: number;
  /** The loudness of the track over its length, a point for the same share of it, in tenths of a dB (LUFS) */
  shortTerm: number[];
  /** The loudness of the 400 ms blocks above the absolute gate: how many fall into each bin of `bin` LU, keyed by the bin number (`-182` is from -18.2 LUFS up) */
  histogram: { bin: number; counts: Record<string, number> };
}

export type LoudnessStatus = 'measured' | 'failed';

/** The row of a track in `track_loudness` */
export interface TrackLoudness {
  path: string;
  status: LoudnessStatus;
  trackGain: number | null;
  trackPeak: number | null;
  albumGain: number | null;
  albumPeak: number | null;
  /** The stat of the file that was measured, a row counts while the library has the same */
  fileModified: number | null;
  fileSize: number | null;
  analysisVersion: number;
  reason: string | null;
  analysis: LoudnessAnalysis | null;
}
