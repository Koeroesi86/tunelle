import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interface as dbusInterface } from 'dbus-next';
import { Player, idleState, mprisIds, startMpris } from './mpris';
import type { MprisCommand, MprisState } from './mpris';

const bus = vi.hoisted(() => ({ on: vi.fn(), export: vi.fn(), requestName: vi.fn(), disconnect: vi.fn() }));

vi.mock('dbus-next', async (importOriginal) => ({ ...(await importOriginal<typeof import('dbus-next')>()), sessionBus: () => bus }));

const state = (overrides: Partial<MprisState> = {}): MprisState => ({
  track: { title: 'Song', artist: 'Artist', album: 'Album', duration: 200, coverUrl: 'file:///run/cover-1.png' },
  playing: true,
  position: 10,
  seeked: false,
  ...overrides,
});

describe('Player', () => {
  const commands: MprisCommand[] = [];
  let player: Player;
  let changed: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    commands.length = 0;
    player = new Player((command) => commands.push(command));
    changed = vi.spyOn(dbusInterface.Interface, 'emitPropertiesChanged').mockImplementation(() => undefined);
  });

  it('is stopped and cannot be controlled without a track', () => {
    expect(player.PlaybackStatus).toBe('Stopped');
    expect([player.CanPlay, player.CanPause, player.CanGoNext, player.CanSeek]).toEqual([false, false, false, false]);
    expect(player.Metadata['mpris:trackid'].value).toBe('/org/mpris/MediaPlayer2/TrackList/NoTrack');
  });

  it('tells the track with its cover and length', () => {
    player.update(state());

    expect(player.PlaybackStatus).toBe('Playing');
    expect(Object.fromEntries(Object.entries(player.Metadata).map(([key, variant]) => [key, variant.value]))).toEqual({
      'mpris:trackid': '/io/github/koeroesi86/Tunelle/Track/1',
      'mpris:length': 200_000_000n,
      'mpris:artUrl': 'file:///run/cover-1.png',
      'xesam:title': 'Song',
      'xesam:artist': ['Artist'],
      'xesam:album': 'Album',
    });
  });

  it('leaves the length out for a station and cannot seek in it', () => {
    player.update(state({ track: { title: 'Radio', artist: '', album: '', duration: 0, coverUrl: undefined } }));

    expect(Object.keys(player.Metadata)).not.toContain('mpris:length');
    expect(Object.keys(player.Metadata)).not.toContain('mpris:artUrl');
    expect(player.Metadata['xesam:artist'].value).toEqual([]);
    expect(player.CanSeek).toBe(false);
  });

  it('moves the position on while it plays and holds it while it is paused', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    player.update(state());
    vi.setSystemTime(2000);
    expect(player.Position).toBe(12_000_000n);

    player.update(state({ playing: false, position: 12 }));
    vi.setSystemTime(9000);
    expect(player.Position).toBe(12_000_000n);
    vi.useRealTimers();
  });

  it('sends what changed and a new track id for a new track only', () => {
    player.update(state());
    expect(changed).toHaveBeenLastCalledWith(player, expect.objectContaining({ PlaybackStatus: 'Playing', Metadata: expect.anything(), CanPlay: true }), []);

    changed.mockClear();
    player.update(state({ position: 20 }));
    expect(changed).not.toHaveBeenCalled();

    player.update(state({ playing: false }));
    expect(changed).toHaveBeenLastCalledWith(player, { PlaybackStatus: 'Paused' }, []);

    player.update(state({ track: { title: 'Next', artist: 'Artist', album: 'Album', duration: 100, coverUrl: undefined } }));
    expect(player.Metadata['mpris:trackid'].value).toBe('/io/github/koeroesi86/Tunelle/Track/2');
  });

  it('sends the cover that arrives after the track as a change of the metadata', () => {
    player.update(state({ track: { title: 'Song', artist: 'Artist', album: 'Album', duration: 200, coverUrl: undefined } }));
    changed.mockClear();

    player.update(state());

    expect(changed).toHaveBeenCalledWith(player, { Metadata: expect.objectContaining({ 'mpris:artUrl': expect.anything() }) }, []);
    expect(player.Metadata['mpris:trackid'].value).toBe('/io/github/koeroesi86/Tunelle/Track/1');
  });

  it('sends Seeked with the new position for a seek', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const seeked = vi.spyOn(player, 'Seeked');
    player.update(state({ seeked: true, position: 50 }));

    expect(seeked).toHaveBeenCalledWith(50_000_000n);
    vi.useRealTimers();
  });

  it('passes the buttons on as commands', () => {
    player.Play();
    player.Pause();
    player.PlayPause();
    player.Stop();
    player.Next();
    player.Previous();

    expect(commands.map(({ name }) => name)).toEqual(['play', 'pause', 'playPause', 'stop', 'next', 'previous']);
  });

  it('turns a seek by an offset and a position of the track into the position to go to', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    player.update(state());
    player.Seek(5_000_000n);
    player.SetPosition('/io/github/koeroesi86/Tunelle/Track/1', 100_000_000n);
    player.SetPosition('/io/github/koeroesi86/Tunelle/Track/0', 30_000_000n);

    expect(commands).toEqual([
      { name: 'seekTo', position: 15 },
      { name: 'seekTo', position: 100 },
    ]);
    vi.useRealTimers();
  });

  it('does not seek in a track that cannot', () => {
    player.update(state({ track: { title: 'Radio', artist: '', album: '', duration: 0, coverUrl: undefined } }));
    player.Seek(5_000_000n);

    expect(commands).toEqual([]);
  });
});

describe('mprisIds', () => {
  it('uses the Flatpak id, and tunelle for the AppImage', () => {
    expect(mprisIds('io.github.koeroesi86.Tunelle')).toEqual({
      busName: 'org.mpris.MediaPlayer2.io.github.koeroesi86.Tunelle',
      desktopEntry: 'io.github.koeroesi86.Tunelle',
    });
    expect(mprisIds(undefined)).toEqual({ busName: 'org.mpris.MediaPlayer2.tunelle', desktopEntry: 'tunelle' });
  });
});

describe('startMpris', () => {
  afterEach(() => vi.clearAllMocks());

  it('owns the name and exports both interfaces on the path', async () => {
    bus.requestName.mockResolvedValue(1);

    const service = await startMpris('Tunelle', 'io.github.koeroesi86.Tunelle', vi.fn());

    expect(bus.requestName).toHaveBeenCalledWith('org.mpris.MediaPlayer2.io.github.koeroesi86.Tunelle', 0);
    expect(bus.export).toHaveBeenCalledTimes(2);
    expect(bus.export).toHaveBeenCalledWith('/org/mpris/MediaPlayer2', expect.anything());
    service.update(idleState);
    service.close();
    expect(bus.disconnect).toHaveBeenCalled();
  });

  it('gives the bus back and says so when the name is taken', async () => {
    bus.requestName.mockResolvedValue(3);

    await expect(startMpris('Tunelle', undefined, vi.fn())).rejects.toThrow('org.mpris.MediaPlayer2.tunelle is taken (3)');
    expect(bus.disconnect).toHaveBeenCalled();
  });

  it('gives the bus back when the request fails', async () => {
    bus.requestName.mockRejectedValue(new Error('no bus'));

    await expect(startMpris('Tunelle', undefined, vi.fn())).rejects.toThrow('no bus');
    expect(bus.disconnect).toHaveBeenCalled();
  });
});
