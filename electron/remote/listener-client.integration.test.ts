import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessControl } from './access';
import { approvalCode, createHostIdentity } from './certificate';
import { startHostServer, type HostServer } from './host-server';
import { contact, fetchAudio, followNowPlaying, requestToListen, sendControl } from './listener-client';
import type { NowPlaying } from '../../shared/schemas/now-playing';

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

let identity = createHostIdentity('Host');
let access = new AccessControl();
let host: HostServer;

const address = () => ({ host: '127.0.0.1', port: host.port });
const asking = (deviceId: string) => ({ deviceId, deviceName: 'Speaker', note: 'Living room' });

describe('the listener against a real host', () => {
  beforeEach(async () => {
    identity = createHostIdentity('Host');
    access = new AccessControl();
    host = await startHostServer({ identity, access, loopbackOnly: true });
  });

  afterEach(() => host.close());

  it('reads the certificate of the host at the first contact, with the code the host shows', async () => {
    const first = await contact(address());

    expect(first.code).toBe(approvalCode(identity.certificate));
    expect(first.certificate.replace(/\s/g, '')).toBe(identity.certificate.replace(/\s/g, ''));
  });

  it('asks, waits, gets the secret after the approval and then follows the host', async () => {
    const { certificate } = await contact(address());
    const deviceId = randomUUID();

    expect(await requestToListen(address(), certificate, asking(deviceId))).toEqual({ status: 'pending' });
    access.approve(deviceId);
    const approved = await requestToListen(address(), certificate, asking(deviceId));
    host.setNowPlaying({ state: 'paused', title: 'Song', position: 7, at: 1 });

    expect(approved.status).toBe('approved');
    const snapshot = await firstSnapshot(address(), certificate, deviceId, approved.secret ?? '');

    // the time of the snapshot is put on the clock of this computer: the same computer here, so it moved by the time the answer took
    expect(snapshot).toMatchObject({ state: 'paused', title: 'Song', position: 7 });
    expect(snapshot.state === 'paused' ? snapshot.at : 0).toBeGreaterThanOrEqual(1);
    expect(snapshot.state === 'paused' ? snapshot.at : 0).toBeLessThan(1 + 2000);
  });

  it('gets each change as the host makes it, with the clock moved, and the end of the stream when the host revokes the device', async () => {
    const { certificate } = await contact(address());
    const deviceId = randomUUID();
    await requestToListen(address(), certificate, asking(deviceId));
    access.approve(deviceId);
    const { secret } = await requestToListen(address(), certificate, asking(deviceId));
    const seen: NowPlaying[] = [];
    const allowed: string[][] = [];
    const ending = followNowPlaying(
      address(),
      certificate,
      deviceId,
      secret ?? '',
      { onSnapshot: (snapshot) => seen.push(snapshot), onControls: (controls) => allowed.push(controls) },
      new AbortController().signal
    );

    await vi.waitFor(() => expect(seen).toHaveLength(1));
    host.setNowPlaying({ state: 'playing', title: 'Song', position: 1, at: 5 });
    await vi.waitFor(() => expect(seen).toHaveLength(2));
    expect(allowed).toEqual([[]]);
    access.setControls(deviceId, ['skip']);
    host.refreshControls();
    await vi.waitFor(() => expect(allowed).toEqual([[], ['skip']]));
    access.revoke(deviceId);
    host.closeRevoked();

    expect(seen.map(({ state }) => state)).toEqual(['idle', 'playing']);
    await expect(ending).rejects.toThrow();
  });

  it('sends a command that the host allowed, and fails on one that it did not', async () => {
    const commands: unknown[] = [];
    await host.close();
    host = await startHostServer({ identity, access, loopbackOnly: true, onControl: (command) => commands.push(command) });
    const { certificate } = await contact(address());
    const deviceId = randomUUID();
    await requestToListen(address(), certificate, asking(deviceId));
    access.approve(deviceId, ['skip']);
    const { secret } = await requestToListen(address(), certificate, asking(deviceId));

    await sendControl(address(), certificate, deviceId, secret ?? '', { control: 'skip', direction: 'next' });
    await expect(sendControl(address(), certificate, deviceId, secret ?? '', { control: 'volume', level: 0.5 })).rejects.toThrow('403');

    expect(commands).toEqual([{ control: 'skip', direction: 'next' }]);
  });

  it('relays the audio of the track that plays with its range, and a stop of the player ends it', async () => {
    await host.close();
    host = await startHostServer({
      identity,
      access,
      loopbackOnly: true,
      serveAudio: async (_path, { headers }) =>
        headers.get('range')
          ? new Response('2345', { status: 206, headers: { 'content-range': 'bytes 2-5/10', 'content-type': 'audio/flac' } })
          : new Response('0123456789'),
    });
    const { certificate } = await contact(address());
    const deviceId = randomUUID();
    await requestToListen(address(), certificate, asking(deviceId));
    access.approve(deviceId);
    const { secret } = await requestToListen(address(), certificate, asking(deviceId));
    host.setNowPlaying({ state: 'playing', title: 'Song', position: 0, at: 1 }, '/music/song.flac');

    const whole = await fetchAudio(address(), certificate, deviceId, secret ?? '', undefined, new AbortController().signal);
    const part = await fetchAudio(address(), certificate, deviceId, secret ?? '', 'bytes=2-5', new AbortController().signal);
    const denied = await fetchAudio(address(), certificate, deviceId, 'guess', undefined, new AbortController().signal);

    expect([whole.status, await whole.text()]).toEqual([200, '0123456789']);
    expect([part.status, part.headers.get('content-range'), await part.text()]).toEqual([206, 'bytes 2-5/10', '2345']);
    expect(denied.status).toBe(401);
    await expect(fetchAudio(address(), certificate, deviceId, secret ?? '', undefined, AbortSignal.abort())).rejects.toThrow();
  });

  it('is told nothing once the host revoked or blocked it, and not before it was approved', async () => {
    const { certificate } = await contact(address());
    const deviceId = randomUUID();
    await requestToListen(address(), certificate, asking(deviceId));
    expect(await revokedStream(address(), certificate, deviceId, 'guess')).toBe('revoked');
    access.approve(deviceId);
    const { secret } = await requestToListen(address(), certificate, asking(deviceId));

    access.revoke(deviceId);

    expect(await revokedStream(address(), certificate, deviceId, secret ?? '')).toBe('revoked');
  });

  it('refuses a host that came back with another certificate than the pinned one', async () => {
    const { certificate } = await contact(address());
    await host.close();
    host = await startHostServer({ identity: createHostIdentity('Host'), access, loopbackOnly: true });

    await expect(requestToListen(address(), certificate, asking(randomUUID()))).rejects.toThrow(/self-signed certificate/);
  });

  it('fails with an error when nothing listens', async () => {
    await host.close();

    await expect(contact(address())).rejects.toThrow(/ECONNREFUSED/);
    host = await startHostServer({ identity, access, loopbackOnly: true });
  });
});
