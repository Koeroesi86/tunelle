/** The least width of a cover of the album grid in px, which the covers grow from to fill the width: what the slider in the bar of the grid picks */
export const coverSizes = { min: 120, max: 240, step: 10, default: 160 } as const;

/** A saved size that is a number is kept inside the range and on a step, any other value is the default */
export const restoreCoverSize = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(Math.round(value / coverSizes.step) * coverSizes.step, coverSizes.min), coverSizes.max)
    : coverSizes.default;
