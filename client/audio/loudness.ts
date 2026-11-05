import type { Loudness } from '@shared/types/library';

/** Off plays the files as they are; track levels every track on its own, album keeps the differences between the tracks of an album */
export type NormalizationMode = 'off' | 'track' | 'album';

export const normalizationModes: NormalizationMode[] = ['off', 'track', 'album'];

export const defaultNormalization: NormalizationMode = 'album';

export const restoreNormalization = (value: unknown): NormalizationMode => normalizationModes.find((mode) => mode === value) ?? defaultNormalization;

/** The gain and the peak that apply: the album ones in album mode, falling back to the track ones for a file without album tags */
const tagsFor = (loudness: Partial<Loudness>, mode: NormalizationMode) => {
  const album = mode === 'album' && typeof loudness.albumGain === 'number';
  return album ? { gain: loudness.albumGain, peak: loudness.albumPeak } : { gain: loudness.trackGain, peak: loudness.trackPeak };
};

/**
 * The factor the sound of a track is multiplied by. A boost stops where the peak would reach full scale, so it never clips;
 * without a peak a boost is not applied at all, a cut always is. A track without a gain plays as it is.
 */
export const normalizationGain = (loudness: Partial<Loudness> | undefined, mode: NormalizationMode) => {
  const { gain, peak } = loudness && mode !== 'off' ? tagsFor(loudness, mode) : { gain: undefined, peak: undefined };
  if (typeof gain !== 'number' || !Number.isFinite(gain)) return 1;

  const ceiling = typeof peak === 'number' && peak > 0 ? 1 / peak : 1;
  return Math.min(10 ** (gain / 20), ceiling);
};
