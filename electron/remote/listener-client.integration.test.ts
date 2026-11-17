import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccessControl } from './access';
import { approvalCode, createHostIdentity } from './certificate';
import { startHostServer, type HostServer } from './host-server';
import { contact, fetchNowPlaying, requestToListen } from './listener-client';

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
    expect(await fetchNowPlaying(address(), certificate, deviceId, approved.secret ?? '')).toEqual({ state: 'paused', title: 'Song', position: 7, at: 1 });
  });

  it('is told nothing once the host revoked or blocked it, and not before it was approved', async () => {
    const { certificate } = await contact(address());
    const deviceId = randomUUID();
    await requestToListen(address(), certificate, asking(deviceId));
    expect(await fetchNowPlaying(address(), certificate, deviceId, 'guess')).toBeUndefined();
    access.approve(deviceId);
    const { secret } = await requestToListen(address(), certificate, asking(deviceId));

    access.revoke(deviceId);

    expect(await fetchNowPlaying(address(), certificate, deviceId, secret ?? '')).toBeUndefined();
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
