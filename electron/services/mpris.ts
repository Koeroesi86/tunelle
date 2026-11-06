import { interface as dbusInterface, sessionBus, Variant } from 'dbus-next';
import type { MessageBus } from 'dbus-next';

// fallow-ignore-file unused-class-member -- dbus-next reads the members that configureMembers lists by name, from outside the class
// See docs/app/mpris.md
const { Interface, ACCESS_READ } = dbusInterface;
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

class Root extends Interface {
  constructor(
    private readonly onCommand: (command: MprisCommand) => void,
    readonly Identity: string,
    readonly DesktopEntry: string
  ) {
    super('org.mpris.MediaPlayer2');
  }

  CanQuit = true;
  CanRaise = true;
  HasTrackList = false;
  SupportedUriSchemes: string[] = [];
  SupportedMimeTypes: string[] = [];

  Raise() {
    this.onCommand({ name: 'raise' });
  }

  Quit() {
    this.onCommand({ name: 'quit' });
  }
}

Root.configureMembers({
  properties: {
    CanQuit: { signature: 'b', access: ACCESS_READ },
    CanRaise: { signature: 'b', access: ACCESS_READ },
    HasTrackList: { signature: 'b', access: ACCESS_READ },
    Identity: { signature: 's', access: ACCESS_READ },
    DesktopEntry: { signature: 's', access: ACCESS_READ },
    SupportedUriSchemes: { signature: 'as', access: ACCESS_READ },
    SupportedMimeTypes: { signature: 'as', access: ACCESS_READ },
  },
  methods: { Raise: {}, Quit: {} },
});

export class Player extends Interface {
  constructor(private readonly onCommand: (command: MprisCommand) => void) {
    super('org.mpris.MediaPlayer2.Player');
  }

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

  /** Clients ask for it when they need it, so it is counted from the last state and not pushed */
  get Position() {
    const elapsed = this.state.playing ? (Date.now() - this.positionAt) / 1000 : 0;

    return BigInt(Math.round(Math.max(0, this.state.position + elapsed) * microseconds));
  }

  get Metadata(): Record<string, Variant> {
    const { track } = this.state;
    if (!track) return { 'mpris:trackid': new Variant('o', noTrack) };

    return {
      'mpris:trackid': new Variant('o', this.trackId),
      ...(track.duration > 0 && { 'mpris:length': new Variant('x', BigInt(Math.round(track.duration * microseconds))) }),
      ...(track.coverUrl && { 'mpris:artUrl': new Variant('s', track.coverUrl) }),
      'xesam:title': new Variant('s', track.title),
      'xesam:artist': new Variant('as', track.artist ? [track.artist] : []),
      'xesam:album': new Variant('s', track.album),
    };
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
    const changed = Object.fromEntries(
      [...after].filter(([name, value]) => value !== before.get(name)).map(([name, value]) => [name, name === 'Metadata' ? this.Metadata : value])
    );

    if (Object.keys(changed).length > 0) Interface.emitPropertiesChanged(this, changed, []);
    if (next.seeked) this.Seeked(this.Position);
  }

  Seeked(position: bigint) {
    return position;
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

  Seek(offset: bigint) {
    if (!this.CanSeek) return;

    this.onCommand({ name: 'seekTo', position: Math.max(0, Number(this.Position) + Number(offset)) / microseconds });
  }

  SetPosition(trackId: string, position: bigint) {
    if (!this.CanSeek || trackId !== this.trackId) return;

    this.onCommand({ name: 'seekTo', position: Number(position) / microseconds });
  }
}

Player.configureMembers({
  properties: {
    PlaybackStatus: { signature: 's', access: ACCESS_READ },
    LoopStatus: { signature: 's', access: ACCESS_READ },
    Rate: { signature: 'd', access: ACCESS_READ },
    MinimumRate: { signature: 'd', access: ACCESS_READ },
    MaximumRate: { signature: 'd', access: ACCESS_READ },
    Shuffle: { signature: 'b', access: ACCESS_READ },
    Volume: { signature: 'd', access: ACCESS_READ },
    Position: { signature: 'x', access: ACCESS_READ },
    Metadata: { signature: 'a{sv}', access: ACCESS_READ },
    CanGoNext: { signature: 'b', access: ACCESS_READ },
    CanGoPrevious: { signature: 'b', access: ACCESS_READ },
    CanPlay: { signature: 'b', access: ACCESS_READ },
    CanPause: { signature: 'b', access: ACCESS_READ },
    CanSeek: { signature: 'b', access: ACCESS_READ },
    CanControl: { signature: 'b', access: ACCESS_READ },
  },
  methods: { Play: {}, Pause: {}, PlayPause: {}, Stop: {}, Next: {}, Previous: {}, Seek: { inSignature: 'x' }, SetPosition: { inSignature: 'ox' } },
  signals: { Seeked: { signature: 'x' } },
});

/** The name an app may own on the session bus: its Flatpak id, or `tunelle` for the AppImage */
export const mprisIds = (flatpakId: string | undefined) => ({
  busName: `org.mpris.MediaPlayer2.${flatpakId ?? 'tunelle'}`,
  desktopEntry: flatpakId ?? 'tunelle',
});

/** Owns the MPRIS name for the app, or says why it could not (no session bus, name taken) */
export const startMpris = async (identity: string, flatpakId: string | undefined, onCommand: (command: MprisCommand) => void): Promise<MprisService> => {
  const { busName, desktopEntry } = mprisIds(flatpakId);
  const bus: MessageBus = sessionBus();
  const player = new Player(onCommand);
  const close = () => bus.disconnect();

  bus.on('error', (error) => console.error('MPRIS bus error', error));
  bus.export(objectPath, new Root(onCommand, identity, desktopEntry));
  bus.export(objectPath, player);

  // 1 is the primary owner, 4 already owned by this connection
  const reply = await bus.requestName(busName, 0).catch((error: unknown) => {
    close();
    throw error;
  });
  if (reply !== 1 && reply !== 4) {
    close();
    throw new Error(`The name ${busName} is taken (${reply})`);
  }

  return { update: (state) => player.update(state), close };
};
