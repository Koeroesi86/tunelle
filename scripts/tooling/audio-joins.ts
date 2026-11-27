// What the changes of track sounded like, from every sample the app sent out. See docs/development/gapless-measurement.md

// a sample under this level is silence, as for the windows of the audio probe
const silent = 0.001;
// 10 ms hold more than four cycles of 440 Hz, enough to tell apart tones that are 440 Hz from each other
const windowSeconds = 0.01;
const stepSeconds = 0.0005;

const isSound = (sample: number) => Math.abs(sample) >= silent;

/** The longest run of silent samples between the first and the last sound, in seconds */
export const longestSilence = (samples: number[], sampleRate: number) => {
  const first = samples.findIndex(isSound);
  if (first < 0) throw new Error('Nothing was heard, so there is no gap to measure');
  // the silence after the last sound is never closed by a sound, so it is not counted
  const [, longest] = samples.slice(first).reduce(([run, most], sample) => (isSound(sample) ? [0, Math.max(most, run)] : [run + 1, most]), [0, 0]);
  return longest / sampleRate;
};

/** The level of one frequency in windows that start every half millisecond: the correlation of each window with a sine and a cosine of it */
const levelsOf = (samples: number[], sampleRate: number, frequency: number) => {
  const length = Math.round(windowSeconds * sampleRate);
  const step = Math.round(stepSeconds * sampleRate);
  const angle = (2 * Math.PI * frequency) / sampleRate;
  const cosines = Array.from({ length }, (_, index) => Math.cos(angle * index));
  const sines = Array.from({ length }, (_, index) => Math.sin(angle * index));
  return Array.from({ length: Math.max(0, Math.floor((samples.length - length) / step) + 1) }, (_, window) => {
    const start = window * step;
    const real = cosines.reduce((sum, cosine, index) => sum + cosine * samples[start + index], 0);
    const imaginary = sines.reduce((sum, sine, index) => sum + sine * samples[start + index], 0);
    return (2 * Math.hypot(real, imaginary)) / length;
  });
};

const highest = (values: number[]) => values.reduce((most, value) => Math.max(most, value), 0);

/** How long both tones sounded at once, in seconds: each counts from half of its own highest level. Both have to be about as loud as each other */
export const overlapOf = (samples: number[], sampleRate: number, [from, to]: [number, number]) => {
  const tones = [from, to].map((frequency) => ({ frequency, levels: levelsOf(samples, sampleRate, frequency) }));
  const peaks = tones.map(({ levels }) => highest(levels));
  // a tone that was not there would be measured as what the other one leaves at its frequency
  const missing = tones.find((_, index) => peaks[index] < Math.max(silent, highest(peaks) / 4));
  if (missing) throw new Error(`The tone of ${missing.frequency} Hz was not heard, so there is no overlap to measure`);

  const [first, second] = tones.map(({ levels }, index) => levels.map((level) => level > peaks[index] / 2));
  const both = first.filter((present, index) => present && second[index]).length;
  return (both * Math.round(stepSeconds * sampleRate)) / sampleRate;
};
