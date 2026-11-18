import { DEFAULT_MAX_LISTENERS } from '../../shared/constants/remote-limits';
import { AccessControl, type Control, type PendingRequest } from './access';
import { startHostServer, type HostServer } from './host-server';
import type { HostSettings, HostStore } from './host-store';
import { nowPlayingSchema, type NowPlaying } from '../../shared/schemas/now-playing';
import { z } from 'zod';
import type { ControlCommand } from '../../shared/schemas/remote-control';
import type { ServeAudio } from './host-routes';
import { approvalCode } from './certificate';
import { advertise, lanAddresses } from './mdns';
import { logError } from '../utils/log-error';

export interface HostState extends HostSettings {
  /** Whether the server listens now */
  running: boolean;
  /** The addresses that other devices connect to while it listens */
  addresses: string[];
  /** The short code of the certificate, which listeners show too */
  code?: string;
  pending: Pick<PendingRequest, 'deviceId' | 'deviceName' | 'note' | 'at'>[];
  devices: { id: string; name: string; blocked: boolean; controls: Control[] }[];
  /** Why the last start failed, so the settings can show it */
  error?: string;
}

export type DeviceAction = 'approve' | 'deny' | 'revoke' | 'block' | 'disconnect';

/** AccessControl that tells the page when a request starts to wait, so no timer is needed */
class ObservedAccess extends AccessControl {
  constructor(
    stored: unknown,
    private readonly onWaiting: () => void
  ) {
    super(stored);
  }

  override request(address: string, body: unknown) {
    const result = super.request(address, body);
    if (result.status === 'pending') this.onWaiting();
    return result;
  }
}

// the file of the track rides along with the snapshot from the page, and only the host knows it
const sourceOf = z.object({ path: z.string().min(1).optional(), coverKey: z.string().min(1).optional() });

/** What the host advertises as its id: its code, so it is the same one the listeners show */
export const advertisementId = (code: string) => code.replace(/\W/g, '').toLowerCase();

const isTaken = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'EADDRINUSE';

/**
 * Starts and stops the host server by its settings, keeps the approved devices on disk and reports the state to the page.
 * Nothing listens until the user turns host mode on. See docs/app/remote-access-discovery.md
 */
export const createHostController = (
  store: HostStore,
  onChange: (state: HostState) => void,
  onControl: (command: ControlCommand) => void,
  version: string,
  serveAudio?: ServeAudio,
  serveCover?: ServeAudio
) => {
  let settings: HostSettings | undefined;
  let access: AccessControl = new AccessControl();
  let server: HostServer | undefined;
  let advertisement: Awaited<ReturnType<typeof advertise>> | undefined;
  let code: string | undefined;
  let error: string | undefined;
  // the last now playing the page sent, which a start that comes after it still shows
  let nowPlaying: NowPlaying | undefined;
  let trackPath: string | undefined;
  let coverKey: string | undefined;
  let changing: Promise<void> = Promise.resolve();

  const state = (): HostState => ({
    ...(settings ?? { enabled: false, name: 'Tunelle', loopbackOnly: false, maxListeners: DEFAULT_MAX_LISTENERS }),
    running: server !== undefined,
    addresses: !server ? [] : settings?.loopbackOnly ? ['127.0.0.1'] : lanAddresses(),
    code,
    error,
    pending: access.pending().map(({ deviceId, deviceName, note, at }) => ({ deviceId, deviceName, note, at })),
    devices: access.snapshot().map(({ id, name, blocked, controls }) => ({ id, name, blocked, controls })),
  });

  const publish = () => onChange(state());
  const saveDevices = () => store.saveDevices(access.snapshot());

  // a saved port that is taken falls back to a free one, which is saved for the next start
  const listen = async (current: HostSettings) => {
    const identity = await store.identity(current.name);
    const options = { identity, access, loopbackOnly: current.loopbackOnly, maxListeners: current.maxListeners, onControl, serveAudio, serveCover };
    const started = await startHostServer({ ...options, port: current.port }).catch((failure: unknown) =>
      isTaken(failure) && current.port ? startHostServer({ ...options, port: 0 }) : Promise.reject(failure)
    );
    code = approvalCode(identity.certificate);
    return started;
  };

  const stop = async () => {
    await advertisement?.stop().catch(logError);
    advertisement = undefined;
    await server?.close();
    server = undefined;
    code = undefined;
  };

  const apply = async () => {
    const current = settings ?? (await store.readSettings());
    settings = current;
    await stop();
    error = undefined;
    if (!current.enabled) return publish();

    try {
      access = new ObservedAccess(await store.readDevices(), publish);
      server = await listen(current);
      if (nowPlaying) server.setNowPlaying(nowPlaying, trackPath, coverKey);
      settings = { ...current, port: server.port };
      await store.saveSettings(settings);
      // a host on loopback is not reachable from the network, so it is not announced; a failed announcement leaves the host working at its address
      if (!current.loopbackOnly && code) {
        advertisement = await advertise({ id: advertisementId(code), name: current.name, port: server.port, version }).catch(
          (failure: unknown) => (logError(failure), undefined)
        );
      }
    } catch (failure) {
      error = failure instanceof Error ? failure.message : 'The host did not start';
      await stop();
    }
    publish();
  };

  // one change at a time: a quick on and off does not leave two servers
  const queue = (task: () => Promise<void>) => {
    changing = changing.then(task, task);
    return changing;
  };

  return {
    start: () => queue(apply),
    stop: () => queue(() => stop().then(publish)),
    state: () => state(),
    update: (change: Partial<Pick<HostSettings, 'enabled' | 'name' | 'loopbackOnly' | 'port' | 'maxListeners'>>) =>
      queue(async () => {
        const current = settings ?? (await store.readSettings());
        settings = { ...current, ...change };
        await store.saveSettings(settings);
        await apply();
      }),
    setNowPlaying: (snapshot: unknown) => {
      const parsed = nowPlayingSchema.safeParse(snapshot);
      if (!parsed.success) return;

      nowPlaying = parsed.data;
      const source = sourceOf.safeParse(snapshot).data;
      trackPath = source?.path;
      coverKey = source?.coverKey;
      server?.setNowPlaying(parsed.data, trackPath, coverKey);
    },
    /** The page asked about a device; a device that is gone or a wrong id changes nothing */
    decide: async (deviceId: string, action: DeviceAction) => {
      const done = {
        approve: () => access.approve(deviceId) !== undefined,
        deny: () => access.deny(deviceId),
        revoke: () => access.revoke(deviceId),
        block: () => (access.block(deviceId), true),
        // the device stays approved and may come back, so nothing is written
        disconnect: () => (server?.disconnect(deviceId), false),
      }[action]();
      if (done) await saveDevices();
      server?.closeRevoked();
      server?.refreshControls();
      publish();
    },
    setControls: async (deviceId: string, controls: Control[]) => {
      if (access.setControls(deviceId, controls)) await saveDevices();
      server?.refreshControls();
      publish();
    },
  };
};

export type HostController = ReturnType<typeof createHostController>;
