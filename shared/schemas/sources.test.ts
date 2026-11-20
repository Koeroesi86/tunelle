import { describe, expect, it } from 'vitest';
import { sourceBrowseSchema, sourcePathSchema, sourceServerInputSchema, toSourcePath } from './sources';

const serverId = '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11';

describe('the path of a track of a server', () => {
  it('is the source, the server and the id, and goes back to them', () => {
    const ref = { source: 'subsonic', serverId, id: 'al-42' } as const;

    expect(toSourcePath(ref)).toBe(`subsonic:${serverId}:al-42`);
    expect(sourcePathSchema.parse(toSourcePath(ref))).toEqual(ref);
  });

  it('keeps a colon of the id of the server', () => {
    expect(sourcePathSchema.parse(`subsonic:${serverId}:a:b:c`).id).toBe('a:b:c');
  });

  it('is the path of a track of a Jellyfin server', () => {
    expect(sourcePathSchema.parse(`jellyfin:${serverId}:abc`)).toEqual({ source: 'jellyfin', serverId, id: 'abc' });
  });

  it.each(['radio:5f6a1c1e', `plex:${serverId}:1`, `subsonic:not-a-uuid:1`, `subsonic:${serverId}:`, '/music/a.flac', ''])('is not the path %j', (path) => {
    expect(sourcePathSchema.safeParse(path).success).toBe(false);
  });
});

describe('a server as the page sends it', () => {
  const input = { id: serverId, kind: 'subsonic', name: ' Home ', url: 'https://music.example.com/navidrome/', username: 'me', password: 'secret' };

  it('is trimmed and has no slash at the end of its address', () => {
    expect(sourceServerInputSchema.parse(input)).toMatchObject({ name: 'Home', url: 'https://music.example.com/navidrome' });
  });

  it.each(['ftp://music.example.com', 'file:///etc/passwd', 'music.example.com', 'javascript:alert(1)'])('does not take the address %j', (url) => {
    expect(sourceServerInputSchema.safeParse({ ...input, url }).success).toBe(false);
  });

  it('needs a password', () => {
    expect(sourceServerInputSchema.safeParse({ ...input, password: '' }).success).toBe(false);
  });
});

describe('what the page asks to browse', () => {
  it('names what it wants and the server', () => {
    expect(sourceBrowseSchema.parse({ what: 'search', serverId, query: ' bach ' })).toEqual({ what: 'search', serverId, query: 'bach' });
    expect(sourceBrowseSchema.safeParse({ what: 'albums', serverId }).success).toBe(false);
    expect(sourceBrowseSchema.safeParse({ what: 'delete', serverId }).success).toBe(false);
  });
});
