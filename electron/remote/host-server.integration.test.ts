import { randomUUID } from 'node:crypto';
import { request } from 'node:https';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccessControl, MAX_PENDING, MAX_REQUESTS_PER_MINUTE } from './access';
import { createHostIdentity, pinnedOptions } from './certificate';
import { startHostServer, type HostServer } from './host-server';

interface Answer {
  status: number;
  body: Record<string, unknown>;
}

let identity = createHostIdentity('Host');
let access = new AccessControl();
let host: HostServer;

const call = (method: string, path: string, { headers = {}, body }: { headers?: Record<string, string>; body?: string } = {}) =>
  new Promise<Answer>((resolve, reject) => {
    const outgoing = request(
      { host: '127.0.0.1', port: host.port, agent: false, method, path, headers, ...pinnedOptions(identity.certificate) },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }));
      }
    );
    outgoing.on('error', reject);
    outgoing.end(body);
  });

const ask = (deviceId = randomUUID(), note = 'Living room') =>
  call('POST', '/remote/request', { body: JSON.stringify({ deviceId, deviceName: 'Speaker', note }) });

const nowPlaying = (deviceId: string, secret: string) =>
  call('GET', '/remote/now-playing', { headers: { 'x-tunelle-device': deviceId, authorization: `Bearer ${secret}` } });

/** An approved device and its secret, as the host screen and the listener would get them; it does not go through the rate limit of the test address */
const approvedDevice = () => {
  const deviceId = randomUUID();
  access.request('setup', { deviceId, deviceName: 'Speaker' });
  access.approve(deviceId);
  const answer = access.request('setup', { deviceId, deviceName: 'Speaker' });
  return { deviceId, secret: answer.status === 'approved' ? (answer.secret ?? '') : '' };
};

describe('the host server', () => {
  beforeEach(async () => {
    identity = createHostIdentity('Host');
    access = new AccessControl();
    host = await startHostServer({ identity, access, loopbackOnly: true });
  });

  afterEach(() => host.close());

  it('keeps a request waiting, and the now playing from a device that waits, is denied or is unknown', async () => {
    const deviceId = randomUUID();

    expect((await ask(deviceId)).status).toBe(202);
    expect((await nowPlaying(deviceId, '')).status).toBe(401);

    access.deny(deviceId);
    expect((await nowPlaying(deviceId, 'guess')).status).toBe(401);
    expect((await nowPlaying(randomUUID(), 'guess')).status).toBe(401);
    expect((await call('GET', '/remote/now-playing')).status).toBe(401);
  });

  it('gives an approved device its secret once, and then the now playing', async () => {
    const deviceId = randomUUID();
    await ask(deviceId);
    const issued = access.approve(deviceId)?.secret;
    const answer = await ask(deviceId);
    const secret = `${answer.body.secret}`;

    expect(answer.status).toBe(200);
    expect(secret).toBe(issued);
    expect((await ask(deviceId)).body).toEqual({ status: 'approved' });
    expect(await nowPlaying(deviceId, secret)).toEqual({ status: 200, body: { state: 'idle' } });

    host.setNowPlaying({ state: 'playing', title: 'Song', position: 12, at: 1000 });

    expect((await nowPlaying(deviceId, secret)).body).toEqual({ state: 'playing', title: 'Song', position: 12, at: 1000 });
  });

  it('closes the now playing for a revoked device and a blocked one, and asks a revoked one again', async () => {
    const revoked = approvedDevice();
    const blocked = approvedDevice();

    access.revoke(revoked.deviceId);
    access.block(blocked.deviceId);

    expect((await nowPlaying(revoked.deviceId, revoked.secret)).status).toBe(401);
    expect((await nowPlaying(blocked.deviceId, blocked.secret)).status).toBe(401);
    expect((await ask(revoked.deviceId)).status).toBe(202);
    expect((await ask(blocked.deviceId)).status).toBe(403);
    expect(access.pending().map((entry) => entry.deviceId)).toEqual([revoked.deviceId]);
  });

  it('shows a hostile note as it was sent and an oversized one as an invalid request, without a prompt', async () => {
    expect((await ask(randomUUID(), '<img src=x onerror=alert(1)>')).status).toBe(202);
    expect(access.pending()[0].note).toBe('<img src=x onerror=alert(1)>');

    expect((await ask(randomUUID(), 'x'.repeat(201))).status).toBe(400);
    expect((await call('POST', '/remote/request', { body: JSON.stringify({ note: 'x'.repeat(1_000_000) }) })).status).toBe(400);
    expect((await call('POST', '/remote/request', { body: 'not json' })).status).toBe(400);
    expect(access.pending()).toHaveLength(1);
  });

  it('stops a flood of requests at the rate limit and at the pending limit', async () => {
    const answers = await Promise.all(Array.from({ length: 30 }, () => ask()));
    const count = (status: number) => answers.filter((answer) => answer.status === status).length;

    expect(count(202)).toBe(Math.min(MAX_PENDING, MAX_REQUESTS_PER_MINUTE));
    expect(count(429)).toBe(30 - MAX_REQUESTS_PER_MINUTE);
    expect(access.pending()).toHaveLength(MAX_PENDING);
  });

  it('serves no other route: library paths, parent folders and other methods are not found', async () => {
    const { deviceId, secret } = approvedDevice();
    const headers = { 'x-tunelle-device': deviceId, authorization: `Bearer ${secret}` };
    const paths = ['/', '/library', '/remote', '/remote/../library', '/%2e%2e/etc/passwd', '/remote/file?path=/etc/passwd', '/remote/now-playing/extra'];

    const answers = await Promise.all(paths.map((path) => call('GET', path, { headers })));

    expect(answers.map((answer) => answer.status)).toEqual(paths.map(() => 404));
    expect((await call('POST', '/remote/now-playing', { headers })).status).toBe(404);
    expect((await call('GET', '/remote/request')).status).toBe(404);
  });

  it('listens on no port after it is closed', async () => {
    await host.close();

    await expect(ask()).rejects.toThrow(/ECONNREFUSED/);
    host = await startHostServer({ identity, access, loopbackOnly: true });
  });
});
