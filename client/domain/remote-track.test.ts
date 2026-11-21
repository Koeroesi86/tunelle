import { describe, expect, it } from 'vitest';
import { isRemoteTrack, isSameRemoteTrack, remoteKeyOf, toRemoteTrack, trackCoverUrl } from './remote-track';

const snapshot = { state: 'playing' as const, title: 'Song', artist: 'Band', album: 'LP', position: 3, at: 1000, duration: 200 };

describe('remote track', () => {
  it('describes what the host plays as a track without a library path', () => {
    expect(toRemoteTrack(snapshot)).toMatchObject({ title: 'Song', artist: 'Band', album: 'LP', duration: 200, picture: null });
    expect(toRemoteTrack(snapshot).path).toMatch(/^remote:\/\//);
  });

  it('has an empty artist, album and no duration for a host that does not say', () => {
    expect(toRemoteTrack({ state: 'paused', title: 'Song', position: 0, at: 1 })).toMatchObject({ artist: '', album: '', duration: null });
  });

  it('gives a new key to a new track and the same key to the same one', () => {
    const { path } = toRemoteTrack(snapshot);
    expect(toRemoteTrack({ ...snapshot, position: 90, at: 5000 }).path).toBe(path);
    expect(toRemoteTrack({ ...snapshot, title: 'Other' }).path).not.toBe(path);
    expect(toRemoteTrack({ ...snapshot, duration: 201 }).path).not.toBe(path);
  });

  it('keeps a key that is safe in an address', () => {
    const key = remoteKeyOf(toRemoteTrack({ ...snapshot, title: 'a&b=c/d?#' }).path);
    expect(key).not.toMatch(/[&=/?#]/);
  });

  it('tells a remote track from any other path', () => {
    expect(isRemoteTrack(toRemoteTrack(snapshot).path)).toBe(true);
    expect.soft(isRemoteTrack('/music/a.flac')).toBe(false);
    expect.soft(isRemoteTrack('radio:abc')).toBe(false);
    expect.soft(isRemoteTrack(undefined)).toBe(false);
    expect(remoteKeyOf('/music/a.flac')).toBeUndefined();
  });

  it('knows the snapshot of the loaded track', () => {
    const { path } = toRemoteTrack(snapshot);
    expect(isSameRemoteTrack(snapshot, path)).toBe(true);
    expect(isSameRemoteTrack({ ...snapshot, title: 'Other' }, path)).toBe(false);
    expect(isSameRemoteTrack(snapshot, undefined)).toBe(false);
  });

  it('shows the cover of the host for a remote track and the own one for a file, and none without a picture', () => {
    const remote = toRemoteTrack({ ...snapshot, cover: true });

    expect(trackCoverUrl(remote)).toContain('/remote/cover?t=');
    expect(trackCoverUrl({ path: '/music/a.flac', picture: 'abc.png' })).not.toContain('/remote/cover');
    expect(trackCoverUrl(toRemoteTrack(snapshot))).toBeUndefined();
    expect(trackCoverUrl({ path: '/music/a.flac', picture: null })).toBeUndefined();
    expect(trackCoverUrl({ path: 'plex:5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11:77', picture: null })).toContain('/source/cover?path=plex%3A5f6a1c1e');
  });
});
