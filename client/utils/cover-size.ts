import { coverSizes } from '../constants/cover-size';

/** A saved size that is a number is kept inside the range and on a step, any other value is the default */
export const restoreCoverSize = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(Math.round(value / coverSizes.step) * coverSizes.step, coverSizes.min), coverSizes.max)
    : coverSizes.default;
