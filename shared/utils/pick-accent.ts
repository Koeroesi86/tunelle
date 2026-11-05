import { toHex } from './to-hex';
import { sampleSize } from '../constants/accent';

/** Pixels the picker looks at: dark, light and grey ones say nothing about the colour of a cover */
const minLightness = 0.2;
const maxLightness = 0.85;
const minSaturation = 0.3;

/** Steps per channel when similar colours are counted together */
const levels = 8;

interface Bucket {
  weight: number;
  sums: number[];
}

const hslOf = (red: number, green: number, blue: number) => {
  const [r, g, b] = [red, green, blue].map((channel) => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));

  return { lightness, saturation };
};

/** The most prominent saturated colour of RGBA pixels as `#rrggbb`, undefined when there is none (a grey cover) */
export const pickAccent = (pixels: ArrayLike<number>): string | undefined => {
  const buckets = new Map<number, Bucket>();

  Array.from({ length: Math.floor(pixels.length / 4) }, (_, index) => index * 4)
    .filter((start) => pixels[start + 3] >= 128)
    .forEach((start) => {
      const channels = [pixels[start], pixels[start + 1], pixels[start + 2]];
      const { lightness, saturation } = hslOf(channels[0], channels[1], channels[2]);
      if (lightness < minLightness || lightness > maxLightness || saturation < minSaturation) return;

      const key = channels.reduce((total, channel) => total * levels + Math.floor((channel * levels) / 256), 0);
      const bucket = buckets.get(key) ?? { weight: 0, sums: [0, 0, 0] };

      // a more saturated pixel counts more, so a vivid detail can win over a dull background
      bucket.weight += saturation;
      bucket.sums = bucket.sums.map((sum, channel) => sum + channels[channel] * saturation);
      buckets.set(key, bucket);
    });

  const best = Array.from(buckets.values()).sort((first, second) => second.weight - first.weight)[0];

  return best && toHex(best.sums.map((sum) => sum / best.weight));
};
