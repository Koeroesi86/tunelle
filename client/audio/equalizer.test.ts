import { describe, expect, it } from 'vitest';
import { bandType, clampGain, defaultGains, equalizerPresets, formatGain, frequencyText, matchingPreset, needsSeek, restoreGains } from './equalizer';
import { equalizerBands, minGain, maxGain } from '../constants/equalizer';

describe('equalizer', () => {
  it('uses shelves at the ends and peaking filters between them', () => {
    const types = equalizerBands.map((_, index) => bandType(index));

    expect(types[0]).toBe('lowshelf');
    expect(types[types.length - 1]).toBe('highshelf');
    expect(new Set(types.slice(1, -1))).toEqual(new Set(['peaking']));
  });

  it('clamps gains and ignores values that are not numbers', () => {
    expect([clampGain(20), clampGain(-20), clampGain(3), clampGain(NaN)]).toEqual([12, -12, 3, 0]);
  });

  it('restores only gains that match the bands', () => {
    expect(restoreGains(defaultGains.map(() => 2))).toEqual(defaultGains.map(() => 2));
    expect(restoreGains([1, 2])).toBe(defaultGains);
    expect(restoreGains(undefined)).toBe(defaultGains);
  });

  it('does not seek for the drift between two clock ticks but does for a real seek', () => {
    expect(needsSeek(10.0004, 10)).toBe(false);
    expect(needsSeek(10, 42)).toBe(true);
  });

  it('has presets of one gain per band within the range, each told apart', () => {
    equalizerPresets.forEach(({ gains }) => {
      expect(gains).toHaveLength(equalizerBands.length);
      gains.forEach((gain) => expect(clampGain(gain)).toBe(gain));
    });
    expect(new Set(equalizerPresets.map(({ id }) => id)).size).toBe(equalizerPresets.length);
    expect(equalizerPresets[0].gains).toEqual(defaultGains);
    expect(minGain).toBeLessThan(maxGain);
  });

  it('knows the preset the gains are, and none for a curve of the own', () => {
    equalizerPresets.forEach(({ id, gains }) => expect(matchingPreset([...gains])).toBe(id));
    expect(matchingPreset(defaultGains.map((_, index) => (index === 4 ? 0.5 : 0)))).toBeUndefined();
  });

  it('writes a gain with its sign and a frequency in Hz or kHz', () => {
    expect([formatGain(5), formatGain(-1.5), formatGain(0)]).toEqual(['+5', '\u22121.5', '0']);
    expect([frequencyText(70), frequencyText(1000), frequencyText(12000)]).toEqual(['70 Hz', '1 kHz', '12 kHz']);
  });
});
