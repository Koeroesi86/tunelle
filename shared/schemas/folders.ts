import { z } from 'zod';

/** A folder of the library; a row of an older library can hold NULL as its modification time, which is taken as 0 */
export const folderSchema = z.object({
  path: z.string(),
  lastModified: z
    .number()
    .nullable()
    .transform((value) => value ?? 0),
});
