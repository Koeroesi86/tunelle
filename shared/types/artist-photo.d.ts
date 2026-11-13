import type { z } from 'zod';
import type { artistPhotoFailureSchema, messageSchemas } from '../schemas/messages';
import type { artistPhotoChangeSchema } from '../schemas/requests';

/** Why a file picked for the photo of an artist cannot be used */
export type ArtistPhotoFailure = z.infer<typeof artistPhotoFailureSchema>;

/** The artists a search of photos found, with the text that was searched */
export type ArtistPhotoCandidates = z.infer<typeof messageSchemas.ARTIST_PHOTO_CANDIDATES>;

/** A change of the photo of a name, as the page asks for it */
export type ArtistPhotoChange = z.infer<typeof artistPhotoChangeSchema>;
