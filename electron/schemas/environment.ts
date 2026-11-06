import { z } from 'zod';

// the TUNELLE_ variables (docs/development/building.md); a value that does not fit is the default, as if the variable was not set

/** A switch: on for `1`, off for anything else */
const flagSchema = z.literal('1');

export const isFlagSet = (value: string | undefined) => flagSchema.safeParse(value).success;

/** A whole number from 1 up to `max` */
export const batchSizeSchema = (max: number, fallback: number) => z.string().transform(Number).pipe(z.number().int().min(1).max(max)).catch(fallback);

/** A number of seconds, 0 or more */
export const secondsSchema = (fallback: number) => z.string().trim().min(1).transform(Number).pipe(z.number().finite().min(0)).catch(fallback);

/** The address of a station directory, none for anything that is not an address */
export const directoryUrlSchema = z.url().optional().catch(undefined);
