/** The value kept between the least and the most; when they are the wrong way round the least wins */
export const clamp = (value: number, least: number, most: number) => Math.max(least, Math.min(most, value));
