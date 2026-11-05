import type { IAudioMetadata } from 'music-metadata';
import type { Loudness } from '@shared/types/library';

type ReadTags = Pick<IAudioMetadata, 'common' | 'native'>;

/** The ReplayGain 2 reference level is -18 LUFS, the one of R128 is -23 LUFS */
const r128Offset = 5;
/** The gain of R128 is a signed 16 bit number in 1/256 dB */
const r128Scale = 256;

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** A peak is a ratio of full scale, so a value that is not above 0 is no peak */
const toPeak = (value: number | null | undefined) => (isNumber(value) && value > 0 ? value : null);

/** The gain of an Opus file in dB at the ReplayGain reference level, null for a tag that is not a whole number */
const fromR128 = (value: unknown) => (typeof value === 'string' && /^\s*-?\d+\s*$/.test(value) ? Number(value) / r128Scale + r128Offset : null);

const r128Of = (native: ReadTags['native'], id: string) =>
  fromR128(
    Object.values(native)
      .flat()
      .find((tag) => tag.id.toUpperCase() === id)?.value
  );

/**
 * The loudness tags of a file: the ReplayGain tags, or for an Opus file the R128 gains, which have no peaks.
 * What is not a number counts as absent. The ReplayGain tags win over the R128 ones.
 */
const readLoudness = (
  { replaygain_track_gain, replaygain_album_gain, replaygain_track_peak, replaygain_album_peak }: ReadTags['common'],
  native: ReadTags['native']
): Loudness => ({
  trackGain: [replaygain_track_gain?.dB, r128Of(native, 'R128_TRACK_GAIN')].find(isNumber) ?? null,
  albumGain: [replaygain_album_gain?.dB, r128Of(native, 'R128_ALBUM_GAIN')].find(isNumber) ?? null,
  trackPeak: toPeak(replaygain_track_peak?.ratio),
  albumPeak: toPeak(replaygain_album_peak?.ratio),
});

export default readLoudness;
