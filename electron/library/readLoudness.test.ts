import { describe, expect, it } from 'vitest';
import readLoudness from './readLoudness';

const ratio = (dB: number | null) => ({ dB, ratio: dB === null ? null : 10 ** (dB / 20) });

describe('readLoudness', () => {
  it('reads the gains and the peaks of ReplayGain tags', () => {
    const common = {
      replaygain_track_gain: ratio(-6.5),
      replaygain_album_gain: ratio(-8),
      replaygain_track_peak: { dB: -0.5, ratio: 0.94 },
      replaygain_album_peak: { dB: -0.1, ratio: 0.99 },
    };

    expect(readLoudness(common as never, {})).toEqual({ trackGain: -6.5, albumGain: -8, trackPeak: 0.94, albumPeak: 0.99 });
  });

  it('has nothing for a file without tags', () => {
    expect(readLoudness({} as never, {})).toEqual({ trackGain: null, albumGain: null, trackPeak: null, albumPeak: null });
  });

  it('counts a malformed value as absent', () => {
    const common = {
      replaygain_track_gain: ratio(null),
      replaygain_album_gain: { dB: Number.NaN, ratio: Number.NaN },
      replaygain_track_peak: { dB: 0, ratio: 0 },
    };

    expect(readLoudness(common as never, { vorbis: [{ id: 'R128_TRACK_GAIN', value: 'loud' }] })).toEqual({
      trackGain: null,
      albumGain: null,
      trackPeak: null,
      albumPeak: null,
    });
  });

  it('reads the R128 gains of an Opus file, which are relative to -23 LUFS, so 5 dB are added to reach the ReplayGain level', () => {
    const native = {
      vorbis: [
        { id: 'R128_TRACK_GAIN', value: '-512' },
        { id: 'r128_album_gain', value: '256' },
      ],
    };

    expect(readLoudness({} as never, native)).toEqual({ trackGain: 3, albumGain: 6, trackPeak: null, albumPeak: null });
  });

  it('prefers the ReplayGain tags to the R128 ones', () => {
    const native = { vorbis: [{ id: 'R128_TRACK_GAIN', value: '0' }] };

    expect(readLoudness({ replaygain_track_gain: ratio(-4) } as never, native).trackGain).toBe(-4);
  });
});
