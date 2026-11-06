import { copyFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { interface as dbusInterface, sessionBus, Variant } from 'dbus-next';
import type { MessageBus } from 'dbus-next';

// Spike for #258, not the service: fixed demo tracks, no link to the player. See docs/development/mpris-spike.md
const { Interface, ACCESS_READ } = dbusInterface;
const objectPath = '/org/mpris/MediaPlayer2';
const flatpakId = process.env.FLATPAK_ID;
const busName = `org.mpris.MediaPlayer2.${flatpakId ?? 'tunelle'}`;
const demoTracks = ['Spike one', 'Spike two', 'Spike three'];

const log = (message: string) => console.log(`[mpris-spike] ${message}`);

class Root extends Interface {
  constructor() {
    super('org.mpris.MediaPlayer2');
  }

  CanQuit = true;
  CanRaise = true;
  HasTrackList = false;
  Identity = 'Tunelle MPRIS spike';
  DesktopEntry = flatpakId ?? 'tunelle';
  SupportedUriSchemes: string[] = [];
  SupportedMimeTypes: string[] = [];

  Raise() {
    log('Raise');
  }

  Quit() {
    log('Quit');
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

class Player extends Interface {
  constructor(private readonly artUrl: string) {
    super('org.mpris.MediaPlayer2.Player');
  }

  PlaybackStatus = 'Playing';
  LoopStatus = 'None';
  Rate = 1;
  MinimumRate = 1;
  MaximumRate = 1;
  Shuffle = false;
  Volume = 1;
  CanGoNext = true;
  CanGoPrevious = true;
  CanPlay = true;
  CanPause = true;
  CanSeek = false;
  CanControl = true;

  private index = 0;
  private startedAt = Date.now();

  // clients ask for the position when they need it, so it is counted from the start of the track and not pushed
  get Position() {
    return BigInt(Math.round((Date.now() - this.startedAt) * 1000));
  }

  get Metadata() {
    return {
      'mpris:trackid': new Variant('o', `/io/github/koeroesi86/Tunelle/Track/${this.index}`),
      'mpris:length': new Variant('x', BigInt(180_000_000)),
      'mpris:artUrl': new Variant('s', this.artUrl),
      'xesam:title': new Variant('s', demoTracks[this.index]),
      'xesam:artist': new Variant('as', ['Tunelle spike']),
      'xesam:album': new Variant('s', 'MPRIS spike'),
    };
  }

  private changed(...names: string[]) {
    const values: Record<string, unknown> = { PlaybackStatus: this.PlaybackStatus, Metadata: this.Metadata };
    const changedProperties = Object.fromEntries(names.map((name) => [name, values[name]]));

    Interface.emitPropertiesChanged(this, changedProperties, []);
  }

  private status(next: string) {
    log(`PlaybackStatus ${next}`);
    this.PlaybackStatus = next;
    this.changed('PlaybackStatus');
  }

  private move(step: number) {
    this.index = (this.index + step + demoTracks.length) % demoTracks.length;
    this.startedAt = Date.now();
    log(`Track ${demoTracks[this.index]}`);
    this.changed('Metadata');
  }

  Play() {
    this.status('Playing');
  }

  Pause() {
    this.status('Paused');
  }

  PlayPause() {
    this.status(this.PlaybackStatus === 'Playing' ? 'Paused' : 'Playing');
  }

  Stop() {
    this.status('Stopped');
  }

  Next() {
    this.move(1);
  }

  Previous() {
    this.move(-1);
  }

  Seek() {
    log('Seek');
  }

  SetPosition() {
    log('SetPosition');
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
});

// the shell reads the cover from the host, so it goes under the runtime folder, which the Flatpak shares as $XDG_RUNTIME_DIR/app/<id>
const writeCover = () => {
  const folder = join(process.env.XDG_RUNTIME_DIR ?? '/tmp', flatpakId ? `app/${flatpakId}` : 'tunelle-spike');
  const file = join(folder, 'cover.png');

  mkdirSync(folder, { recursive: true });
  copyFileSync(resolve(__dirname, '../../icons/png/512x512.png'), file);

  return `file://${file}`;
};

let bus: MessageBus | undefined;

export const startMprisSpike = async () => {
  bus = sessionBus();
  bus.on('error', (error) => log(`Bus error ${String(error)}`));
  bus.export(objectPath, new Root());
  bus.export(objectPath, new Player(writeCover()));

  // 1 is the primary owner, 3 means the name is taken or queued
  const reply = await bus.requestName(busName, 0);

  log(`requestName ${busName} -> ${reply}`);
};

export const stopMprisSpike = () => bus?.disconnect();
