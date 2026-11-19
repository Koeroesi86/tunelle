import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, idleState, mprisIds, startMpris } from './mpris';
import type { MprisCommand, MprisState } from './mpris';

const bus = vi.hoisted(() => ({
  connection: { on: vi.fn(), end: vi.fn() },
  exportInterface: vi.fn(),
  requestName: vi.fn(),
  sendSignal: vi.fn(),
}));

vi.mock('@homebridge/dbus-native', () => ({ sessionBus: () => bus }));

const state = (overrides: Partial<MprisState> = {}): MprisState => ({
  track: { title: 'Song', artist: 'Artist', album: 'Album', duration: 200, coverUrl: 'file:///run/cover-1.png' },
  playing: true,
  position: 10,
  seeked: false,
  ...overrides,
});

const metadataOf = (player: Player) => Object.fromEntries(player.Metadata.map(([key, [, value]]) => [key, value]));

describe('Player', () => {
  const commands: MprisCommand[] = [];
  let player: Player;
  const propertiesChanged = vi.fn();
  const seeked = vi.fn();

  beforeEach(() => {
    commands.length = 0;
    propertiesChanged.mockClear();
    seeked.mockClear();
    player = new Player((command) => commands.push(command), { propertiesChanged, seeked });
  });

  it('is stopped and cannot be controlled without a track', () => {
    expect(player.PlaybackStatus).toBe('Stopped');
    expect([player.CanPlay, player.CanPause, player.CanGoNext, player.CanSeek]).toEqual([false, false, false, false]);
    expect(metadataOf(player)['mpris:trackid']).toBe('/org/mpris/MediaPlayer2/TrackList/NoTrack');
  });

  it('tells the track with its cover and length', () => {
    player.update(state());

    expect(player.PlaybackStatus).toBe('Playing');
    expect(metadataOf(player)).toEqual({
      'mpris:trackid': '/io/github/koeroesi86/Tunelle/Track/1',
      'mpris:length': 200_000_000,
      'mpris:artUrl': 'file:///run/cover-1.png',
      'xesam:title': 'Song',
      'xesam:artist': ['Artist'],
      'xesam:album': 'Album',
    });
  });

  it('leaves the length out for a station and cannot seek in it', () => {
    player.update(state({ track: { title: 'Radio', artist: '', album: '', duration: 0, coverUrl: undefined } }));

    expect(Object.keys(metadataOf(player))).not.toContain('mpris:length');
    expect(Object.keys(metadataOf(player))).not.toContain('mpris:artUrl');
    expect(metadataOf(player)['xesam:artist']).toEqual([]);
    expect(player.CanSeek).toBe(false);
  });

  it('moves the position on while it plays and holds it while it is paused', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    player.update(state());
    vi.setSystemTime(2000);
    expect(player.Position).toBe(12_000_000);

    player.update(state({ playing: false, position: 12 }));
    vi.setSystemTime(9000);
    expect(player.Position).toBe(12_000_000);
    vi.useRealTimers();
  });

  it('sends what changed and a new track id for a new track only', () => {
    player.update(state());
    expect(propertiesChanged).toHaveBeenLastCalledWith(expect.objectContaining({ PlaybackStatus: 'Playing', Metadata: expect.anything(), CanPlay: true }));

    propertiesChanged.mockClear();
    player.update(state({ position: 20 }));
    expect(propertiesChanged).not.toHaveBeenCalled();

    player.update(state({ playing: false }));
    expect(propertiesChanged).toHaveBeenLastCalledWith({ PlaybackStatus: 'Paused' });

    player.update(state({ track: { title: 'Next', artist: 'Artist', album: 'Album', duration: 100, coverUrl: undefined } }));
    expect(metadataOf(player)['mpris:trackid']).toBe('/io/github/koeroesi86/Tunelle/Track/2');
  });

  it('sends the cover that arrives after the track as a change of the metadata', () => {
    player.update(state({ track: { title: 'Song', artist: 'Artist', album: 'Album', duration: 200, coverUrl: undefined } }));
    propertiesChanged.mockClear();

    player.update(state());

    expect(propertiesChanged).toHaveBeenCalledWith({ Metadata: expect.arrayContaining([['mpris:artUrl', ['s', 'file:///run/cover-1.png']]]) });
    expect(metadataOf(player)['mpris:trackid']).toBe('/io/github/koeroesi86/Tunelle/Track/1');
  });

  it('sends Seeked with the new position for a seek', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    player.update(state({ seeked: true, position: 50 }));

    expect(seeked).toHaveBeenCalledWith(50_000_000);
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
    player.Seek(5_000_000);
    player.SetPosition('/io/github/koeroesi86/Tunelle/Track/1', 100_000_000);
    player.SetPosition('/io/github/koeroesi86/Tunelle/Track/0', 30_000_000);

    expect(commands).toEqual([
      { name: 'seekTo', position: 15 },
      { name: 'seekTo', position: 100 },
    ]);
    vi.useRealTimers();
  });

  it('does not seek in a track that cannot', () => {
    player.update(state({ track: { title: 'Radio', artist: '', album: '', duration: 0, coverUrl: undefined } }));
    player.Seek(5_000_000);

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

  const reply = (value: number) => bus.requestName.mockImplementation((_name, _flags, callback) => callback(null, value));

  it('owns the name and exports both interfaces on the path', async () => {
    reply(1);

    const service = await startMpris('Tunelle', 'io.github.koeroesi86.Tunelle', vi.fn());

    expect(bus.requestName).toHaveBeenCalledWith('org.mpris.MediaPlayer2.io.github.koeroesi86.Tunelle', 0, expect.any(Function));
    expect(bus.exportInterface).toHaveBeenCalledTimes(2);
    expect(bus.exportInterface).toHaveBeenCalledWith(expect.anything(), '/org/mpris/MediaPlayer2', expect.objectContaining({ name: 'org.mpris.MediaPlayer2' }));
    expect(bus.exportInterface).toHaveBeenCalledWith(
      expect.anything(),
      '/org/mpris/MediaPlayer2',
      expect.objectContaining({ name: 'org.mpris.MediaPlayer2.Player' })
    );
    service.close();
    expect(bus.connection.end).toHaveBeenCalled();
  });

  it('sends the changes as PropertiesChanged and a seek as Seeked', async () => {
    reply(1);
    const service = await startMpris('Tunelle', undefined, vi.fn());

    service.update(state({ seeked: true }));

    expect(bus.sendSignal).toHaveBeenCalledWith('/org/mpris/MediaPlayer2', 'org.freedesktop.DBus.Properties', 'PropertiesChanged', 'sa{sv}as', [
      'org.mpris.MediaPlayer2.Player',
      expect.arrayContaining([['PlaybackStatus', ['s', 'Playing']]]),
      [],
    ]);
    expect(bus.sendSignal).toHaveBeenCalledWith('/org/mpris/MediaPlayer2', 'org.mpris.MediaPlayer2.Player', 'Seeked', 'x', [expect.any(Number)]);
    service.update(idleState);
  });

  it('gives the bus back and says so when the name is taken', async () => {
    reply(3);

    await expect(startMpris('Tunelle', undefined, vi.fn())).rejects.toThrow('org.mpris.MediaPlayer2.tunelle is taken (3)');
    expect(bus.connection.end).toHaveBeenCalled();
  });

  it('gives the bus back when the request fails', async () => {
    bus.requestName.mockImplementation((_name, _flags, callback) => callback({ name: 'x', message: 'no bus' }));

    await expect(startMpris('Tunelle', undefined, vi.fn())).rejects.toThrow('no bus');
    expect(bus.connection.end).toHaveBeenCalled();
  });
});
