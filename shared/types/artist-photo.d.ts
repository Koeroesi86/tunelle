import type { z } from 'zod';
import type { artistPhotoFailureSchema } from '../schemas/messages';

/** Why a file picked for the photo of an artist cannot be used */
export type ArtistPhotoFailure = z.infer<typeof artistPhotoFailureSchema>;
