import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NowPlaying } from '../../shared/schemas/now-playing';
import { createHostController, type HostController, type HostState } from './host-controller';
import { createHostStore } from './host-store';
import { contact, followNowPlaying, requestToListen } from './listener-client';

/** The first snapshot of the event stream, after which the stream is closed */
const firstSnapshot = (target: { host: string; port: number }, certificate: string, deviceId: string, secret: string) => {
  const stop = new AbortController();
  return new Promise<NowPlaying>((resolve) => {
    followNowPlaying(
      target,
      certificate,
      deviceId,
      secret,
      { onSnapshot: (snapshot) => (resolve(snapshot), stop.abort()), onControls: () => undefined },
      stop.signal
    ).catch(() => undefined);
  });
};
const revokedStream = (target: { host: string; port: number }, certificate: string, deviceId: string, secret: string) =>
  followNowPlaying(target, certificate, deviceId, secret, { onSnapshot: () => undefined, onControls: () => undefined }, new AbortController().signal);

let folder: string;
let state: HostState | undefined;
let host: HostController;

const open = () => {
  host = createHostController(
    createHostStore(folder),
    (next) => (state = next),
    () => undefined,
    '26.1.7'
  );
  return host;
};
const address = () => ({ host: '127.0.0.1', port: host.state().port ?? 0 });
const asking = (deviceId: string) => ({ deviceId, deviceName: 'Speaker', note: '' });

describe('the host controller with real files and a real server', () => {
  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'tunelle-host-'));
    state = undefined;
  });

  afterEach(async () => {
    await host.stop();
    await rm(folder, { recursive: true, force: true });
  });

  it('opens no socket until the host is turned on, and then answers on the port it saved', async () => {
    await open().start();
    expect(state).toMatchObject({ enabled: false, running: false });

    await host.update({ enabled: true, loopbackOnly: true });
    const first = await contact(address());

    expect(state).toMatchObject({ running: true, code: first.code });
    expect(JSON.parse(await readFile(join(folder, 'remote', 'host.json'), 'utf8'))).toMatchObject({ enabled: true, port: state?.port });
  });

  it('writes the key readable by its owner only, and refuses connections once host mode is off', async () => {
    await open().update({ enabled: true, loopbackOnly: true });

    if (process.platform !== 'win32') expect((await stat(join(folder, 'remote', 'host-key.pem'))).mode & 0o077).toBe(0);
    await host.update({ enabled: false });

    await expect(contact(address())).rejects.toThrow();
  });

  it('remembers an approved device through a restart: same certificate, same port, no new prompt', async () => {
    await open().update({ enabled: true, loopbackOnly: true });
    const { certificate, code } = await contact(address());
    const deviceId = randomUUID();
    await requestToListen(address(), certificate, asking(deviceId));
    await host.decide(deviceId, 'approve');
    const secret = (await requestToListen(address(), certificate, asking(deviceId))).secret ?? '';
    const port = state?.port;
    await host.stop();

    await open().start();
    host.setNowPlaying({ state: 'paused', title: 'Song', position: 7, at: 1 });

    expect(state).toMatchObject({ running: true, port, code });
    expect(await firstSnapshot(address(), certificate, deviceId, secret)).toMatchObject({ title: 'Song' });
  });

  it('shows a waiting request to the page, and a revoked device gets nothing', async () => {
    await open().update({ enabled: true, loopbackOnly: true });
    const { certificate } = await contact(address());
    const deviceId = randomUUID();

    await requestToListen(address(), certificate, asking(deviceId));
    expect(state?.pending).toMatchObject([{ deviceId, deviceName: 'Speaker' }]);

    await host.decide(deviceId, 'approve');
    const secret = (await requestToListen(address(), certificate, asking(deviceId))).secret ?? '';
    await host.decide(deviceId, 'revoke');

    expect(await revokedStream(address(), certificate, deviceId, secret)).toBe('revoked');
  });
});
