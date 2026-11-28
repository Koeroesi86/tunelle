import { describe, expect, it } from 'vitest';
import { libraryViewSchema, onlineViewSchema } from './navigation';

// the view that was open is saved and read again at the next start, so a value that is no longer accepted loses it
describe('the views that are saved', () => {
  it.each(['albums', 'artists', 'albumArtists', 'genres', 'tracks', 'folders'])('reads the library view %s', (view) => {
    expect(libraryViewSchema.parse(view)).toBe(view);
  });

  const pages = ['radio', 'servers', 'jellyfin', 'plex', 'nearby'];
  const sections = ['subsonic', 'jellyfin', 'plex'].flatMap((kind) => ['albums', 'artists', 'tracks'].map((section) => `${kind}:${section}`));

  it.each([...pages, ...sections])('reads the online view %s', (view) => {
    expect(onlineViewSchema.parse(view)).toBe(view);
  });

  it.each(['', 'subsonic', 'plex:', 'plex:genres', ':albums'])('refuses %j', (view) => {
    expect(onlineViewSchema.safeParse(view).success).toBe(false);
    expect(libraryViewSchema.safeParse(view).success).toBe(false);
  });
});
