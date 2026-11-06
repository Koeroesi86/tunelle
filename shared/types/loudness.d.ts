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
  /** How many tracks the album had when its gain was pooled, null before it was */
  albumTracks: number | null;
  /** The stat of the file that was measured, a row counts while the library has the same */
  fileModified: number | null;
  fileSize: number | null;
  analysisVersion: number;
  reason: string | null;
  analysis: LoudnessAnalysis | null;
}

/** What the main process asks the measuring page for */
export interface MeasureRequest {
  id: number;
  /** The path of a track of the library, which the page fetches from `tunelle://app/track` */
  path: string;
}

/**
 * What the measuring page answers. Undecodable is a file the browser cannot decode, unreadable one that could not be fetched (a drive that went away),
 * which is tried again later; silent has no block above the absolute gate
 */
export type MeasureResult =
  | { id: number; outcome: 'measured'; analysis: LoudnessAnalysis; trackGain: number; trackPeak: number }
  | { id: number; outcome: 'silent' | 'undecodable' | 'unreadable' };

export interface LoudnessApi {
  onMeasure: (listener: (request: MeasureRequest) => void) => void;
  report: (result: MeasureResult) => void;
  /** The page can take a request: the listener is set */
  ready: () => void;
}
