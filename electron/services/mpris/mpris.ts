import { sessionBus } from '@homebridge/dbus-native';
import type { InterfaceDescription } from '@homebridge/dbus-native';

// fallow-ignore-file unused-class-member -- dbus-native calls the members that the interface descriptions list by name, from outside the class
// See docs/app/mpris.md
const objectPath = '/org/mpris/MediaPlayer2';
const noTrack = '/org/mpris/MediaPlayer2/TrackList/NoTrack';
const microseconds = 1_000_000;

export interface MprisTrack {
  title: string;
  artist: string;
  album: string;
  /** In seconds, 0 for a station */
  duration: number;
  /** A file the desktop shell can read */
  coverUrl: string | undefined;
}

export interface MprisState {
  track: MprisTrack | undefined;
  playing: boolean;
  /** In seconds */
  position: number;
  /** The position jumped (a seek), as opposed to moving on with the playback */
  seeked: boolean;
}

export type MprisCommand = { name: 'play' | 'pause' | 'playPause' | 'stop' | 'next' | 'previous' | 'raise' | 'quit' } | { name: 'seekTo'; position: number };

export interface MprisService {
  update: (state: MprisState) => void;
  close: () => void;
}

export const idleState: MprisState = { track: undefined, playing: false, position: 0, seeked: false };

const rootName = 'org.mpris.MediaPlayer2';
const playerName = 'org.mpris.MediaPlayer2.Player';

const rootDescription: InterfaceDescription = {
  name: rootName,
  methods: { Raise: ['', '', [], []], Quit: ['', '', [], []] },
  properties: { CanQuit: 'b', CanRaise: 'b', HasTrackList: 'b', Identity: 's', DesktopEntry: 's', SupportedUriSchemes: 'as', SupportedMimeTypes: 'as' },
};

const playerProperties: Record<string, string> = {
  PlaybackStatus: 's',
  LoopStatus: 's',
  Rate: 'd',
  MinimumRate: 'd',
  MaximumRate: 'd',
  Shuffle: 'b',
  Volume: 'd',
  Position: 'x',
  Metadata: 'a{sv}',
  CanGoNext: 'b',
  CanGoPrevious: 'b',
  CanPlay: 'b',
  CanPause: 'b',
  CanSeek: 'b',
  CanControl: 'b',
};

const playerDescription: InterfaceDescription = {
  name: playerName,
  methods: {
    Play: ['', '', [], []],
    Pause: ['', '', [], []],
    PlayPause: ['', '', [], []],
    Stop: ['', '', [], []],
    Next: ['', '', [], []],
    Previous: ['', '', [], []],
    Seek: ['x', '', ['Offset'], []],
    SetPosition: ['ox', '', ['TrackId', 'Position'], []],
  },
  properties: playerProperties,
  signals: { Seeked: ['x', 'Position'] },
};

/** A value of a variant: its signature and the value */
type Typed = [string, string | number | string[]];
/** What a client reads: a number or text, or the metadata as pairs of a key and a typed value */
type PropertyValue = string | number | boolean | Array<[string, Typed]>;

export interface PlayerSignals {
  propertiesChanged: (changed: Record<string, PropertyValue>) => void;
  seeked: (position: number) => void;
}

class Root {
  readonly CanQuit = true;
  readonly CanRaise = true;
  readonly HasTrackList = false;
  readonly SupportedUriSchemes: string[] = [];
  readonly SupportedMimeTypes: string[] = [];

  constructor(
    private readonly onCommand: (command: MprisCommand) => void,
    readonly Identity: string,
    readonly DesktopEntry: string
  ) {}

  Raise() {
    this.onCommand({ name: 'raise' });
  }

  Quit() {
    this.onCommand({ name: 'quit' });
  }
}

export class Player {
  LoopStatus = 'None';
  Rate = 1;
  MinimumRate = 1;
  MaximumRate = 1;
  Shuffle = false;
  Volume = 1;
  CanControl = true;

  private state = idleState;
  private trackNumber = 0;
  private trackKey = '';
  // the position at the moment of the last state, which a playing track moves on from
  private positionAt = Date.now();

  constructor(
    private readonly onCommand: (command: MprisCommand) => void,
    private readonly signals: PlayerSignals
  ) {}

  get PlaybackStatus() {
    if (!this.state.track) return 'Stopped';

    return this.state.playing ? 'Playing' : 'Paused';
  }

  get CanGoNext() {
    return Boolean(this.state.track);
  }

  get CanGoPrevious() {
    return Boolean(this.state.track);
  }

  get CanPlay() {
    return Boolean(this.state.track);
  }

  get CanPause() {
    return Boolean(this.state.track);
  }

  get CanSeek() {
    return (this.state.track?.duration ?? 0) > 0;
  }

  /** In microseconds. Clients ask for it when they need it, so it is counted from the last state and not pushed */
  get Position() {
    const elapsed = this.state.playing ? (Date.now() - this.positionAt) / 1000 : 0;

    return Math.round(Math.max(0, this.state.position + elapsed) * microseconds);
  }

  get Metadata(): Array<[string, Typed]> {
    const { track } = this.state;
    if (!track) return [['mpris:trackid', ['o', noTrack]]];

    return [
      ['mpris:trackid', ['o', this.trackId]],
      ...(track.duration > 0 ? [['mpris:length', ['x', Math.round(track.duration * microseconds)]] satisfies [string, Typed]] : []),
      ...(track.coverUrl ? [['mpris:artUrl', ['s', track.coverUrl]] satisfies [string, Typed]] : []),
      ['xesam:title', ['s', track.title]],
      ['xesam:artist', ['as', track.artist ? [track.artist] : []]],
      ['xesam:album', ['s', track.album]],
    ];
  }

  private get trackId() {
    return `/io/github/koeroesi86/Tunelle/Track/${this.trackNumber}`;
  }

  /** What a client can see change; the metadata is compared by what it is made of */
  private snapshot() {
    const { track } = this.state;

    return new Map(
      Object.entries({
        PlaybackStatus: this.PlaybackStatus,
        Metadata: JSON.stringify([this.trackNumber, track?.title, track?.artist, track?.album, track?.duration, track?.coverUrl]),
        CanSeek: this.CanSeek,
        CanGoNext: this.CanGoNext,
        CanGoPrevious: this.CanGoPrevious,
        CanPlay: this.CanPlay,
        CanPause: this.CanPause,
      })
    );
  }

  update(next: MprisState) {
    const before = this.snapshot();
    const key = next.track ? [next.track.title, next.track.artist, next.track.album, next.track.duration].join('\0') : '';
    if (key !== this.trackKey) this.trackNumber += 1;
    this.trackKey = key;
    this.state = next;
    this.positionAt = Date.now();

    const after = this.snapshot();
    const changed: Record<string, PropertyValue> = Object.fromEntries(
      [...after].filter(([name, value]) => value !== before.get(name)).map(([name, value]) => [name, name === 'Metadata' ? this.Metadata : value])
    );

    if (Object.keys(changed).length > 0) this.signals.propertiesChanged(changed);
    if (next.seeked) this.signals.seeked(this.Position);
  }

  Play() {
    this.onCommand({ name: 'play' });
  }

  Pause() {
    this.onCommand({ name: 'pause' });
  }

  PlayPause() {
    this.onCommand({ name: 'playPause' });
  }

  Stop() {
    this.onCommand({ name: 'stop' });
  }

  Next() {
    this.onCommand({ name: 'next' });
  }

  Previous() {
    this.onCommand({ name: 'previous' });
  }

  Seek(offset: number) {
    if (!this.CanSeek) return;

    this.onCommand({ name: 'seekTo', position: Math.max(0, this.Position + offset) / microseconds });
  }

  SetPosition(trackId: string, position: number) {
    if (!this.CanSeek || trackId !== this.trackId) return;

    this.onCommand({ name: 'seekTo', position: position / microseconds });
  }
}

/** The name an app may own on the session bus: its Flatpak id, or `tunelle` for the AppImage */
export const mprisIds = (flatpakId: string | undefined) => ({
  busName: `org.mpris.MediaPlayer2.${flatpakId ?? 'tunelle'}`,
  desktopEntry: flatpakId ?? 'tunelle',
});

/** Owns the MPRIS name for the app, or says why it could not (no session bus, name taken) */
export const startMpris = async (identity: string, flatpakId: string | undefined, onCommand: (command: MprisCommand) => void): Promise<MprisService> => {
  const { busName, desktopEntry } = mprisIds(flatpakId);
  const bus = sessionBus();
  const close = () => bus.connection.end();
  const player = new Player(onCommand, {
    propertiesChanged: (changed) =>
      bus.sendSignal(objectPath, 'org.freedesktop.DBus.Properties', 'PropertiesChanged', 'sa{sv}as', [
        playerName,
        Object.entries(changed).map(([name, value]) => [name, [playerProperties[name], value]]),
        [],
      ]),
    seeked: (position) => bus.sendSignal(objectPath, playerName, 'Seeked', 'x', [position]),
  });

  bus.connection.on('error', (error: unknown) => console.error('MPRIS bus error', error));
  bus.exportInterface(new Root(onCommand, identity, desktopEntry), objectPath, rootDescription);
  bus.exportInterface(player, objectPath, playerDescription);

  // 1 is the primary owner, 4 already owned by this connection
  const reply = await new Promise<number | undefined>((resolve, reject) =>
    bus.requestName(busName, 0, (error, result) => (error ? reject(new Error(error.message)) : resolve(result)))
  ).catch((error: unknown) => {
    close();
    throw error;
  });
  if (reply !== 1 && reply !== 4) {
    close();
    throw new Error(`The name ${busName} is taken (${reply})`);
  }

  return { update: (state) => player.update(state), close };
};
