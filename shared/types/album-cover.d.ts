import type { z } from 'zod';
import type { albumCoverFailureSchema, messageSchemas } from '../schemas/messages';
import type { albumCoverChangeSchema } from '../schemas/requests';

/** Why a file picked for the cover of an album cannot be used */
export type AlbumCoverFailure = z.infer<typeof albumCoverFailureSchema>;

/** The cover an album has after a change, null when it has none */
export type AlbumCoverChanged = z.infer<typeof messageSchemas.ALBUM_COVER_CHANGED>;

/** A change of the cover of an album, as the page asks for it */
export type AlbumCoverChange = z.infer<typeof albumCoverChangeSchema>;

/** The albums a search of covers found, with the text that was searched */
export type AlbumCoverCandidates = z.infer<typeof messageSchemas.ALBUM_COVER_CANDIDATES>;
