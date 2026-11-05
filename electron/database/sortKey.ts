import type { Track } from '@shared/types/library';

/** The value to sort a text by: without case, accents and the space around it, so `Ékes` sorts among the `E` */
export const toSortKey = (value: string | null | undefined) => (value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** The keys of the columns that are sorted or grouped as text, in the order of the columns title_key, artist_key, album_key, album_artist_key, genre_key */
export const toSortKeys = ({ title, artist, album, albumArtist, genre }: Pick<Track, 'title' | 'artist' | 'album' | 'albumArtist' | 'genre'>) => [
  toSortKey(title),
  toSortKey(artist),
  toSortKey(album),
  toSortKey(albumArtist),
  toSortKey(genre),
];
