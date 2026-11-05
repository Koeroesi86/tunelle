import { equalizerBands, minGain, maxGain } from '../constants/equalizer';
export interface EqualizerBand {
  label: string;
  frequency: number;
}

export const defaultGains = equalizerBands.map(() => 0);

export interface EqualizerPreset {
  id: string;
  gains: number[];
}

export const equalizerPresets: EqualizerPreset[] = [
  { id: 'flat', gains: defaultGains },
  { id: 'bass', gains: [5, 4, 2, -1, -2, 0, 2, 4, 5, 3.5] },
  { id: 'vocal', gains: [-3, -2, 0, 3, 4, 4, 2, 0, -1, -2] },
  { id: 'treble', gains: [-2, -1, 0, 0, 0, 2, 4, 6, 7, 7] },
  { id: 'loudness', gains: [6, 4, 1, -1, -1, 0, 1, 3, 5, 6] },
];

// the preset the gains are, if they are one: a hand made curve is none
export const matchingPreset = (gains: number[]) => equalizerPresets.find((preset) => preset.gains.every((gain, index) => gain === gains[index]))?.id;

export const gainStep = 0.5;

export const formatGain = (gain: number) => (gain > 0 ? '+' : gain < 0 ? '\u2212' : '') + Math.abs(gain);

export const frequencyText = (frequency: number) => (frequency >= 1000 ? `${frequency / 1000} kHz` : `${frequency} Hz`);

export const clampGain = (gain: number) => Math.min(maxGain, Math.max(minGain, Number.isFinite(gain) ? gain : 0));

// settings saved before gains were in dB hold another number of unscaled values, so they are dropped
export const restoreGains = (gains: unknown): number[] =>
  Array.isArray(gains) && gains.length === equalizerBands.length ? gains.map((gain) => clampGain(Number(gain))) : defaultGains;

export const bandType = (index: number): BiquadFilterType => {
  if (index === 0) return 'lowshelf';
  if (index === equalizerBands.length - 1) return 'highshelf';
  return 'peaking';
};

// the audio element drifts a little between the clock tick and the seek it triggers, which must not rewind it
const seekTolerance = 0.1;

export const needsSeek = (nodeTime: number, to: number) => Math.abs(nodeTime - to) > seekTolerance;
