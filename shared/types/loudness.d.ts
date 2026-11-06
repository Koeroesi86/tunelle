import type { LoudnessAnalysis, LoudnessProgress, MeasureResult } from '../schemas/loudness';

export type { LoudnessAnalysis, LoudnessProgress, MeasureResult };

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
  /** The length of the track in seconds, when the library has it: a long one is decoded in pieces */
  duration?: number;
}

export interface LoudnessApi {
  onMeasure: (listener: (request: MeasureRequest) => void) => void;
  report: (result: MeasureResult) => void;
  /** The measurement of the request made progress: a piece of the file was read or decoded. A measurement without it for a while is stalled */
  progress: (id: number) => void;
  /** The page can take a request: the listener is set */
  ready: () => void;
}
