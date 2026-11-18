import { z } from 'zod';

/** The page opens or closes the list of nearby Tunelles */
export const nearbyRequestSchema = z.object({ active: z.boolean() });
