import type { EqualizerBand } from '../audio/equalizer';

export const equalizerBands: EqualizerBand[] = [
  { label: '70', frequency: 70 },
  { label: '180', frequency: 180 },
  { label: '320', frequency: 320 },
  { label: '600', frequency: 600 },
  { label: '1k', frequency: 1000 },
  { label: '3k', frequency: 3000 },
  { label: '6k', frequency: 6000 },
  { label: '12k', frequency: 12000 },
  { label: '14k', frequency: 14000 },
  { label: '16k', frequency: 16000 },
];
export const minGain = -12;
export const maxGain = 12;
