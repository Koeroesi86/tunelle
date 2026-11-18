import { randomUUID } from 'node:crypto';
import { request } from 'node:https';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

/** Opens the event stream and collects what arrives, until it is ended by the host or the test */
const listen = (deviceId: string, secret: string) => {
  const events: string[] = [];
  let ended = false;
  const outgoing = request(
    {
      host: '127.0.0.1',
      port: host.port,
      agent: false,
      path: '/remote/events',
      headers: { 'x-tunelle-device': deviceId, authorization: `Bearer ${secret}` },
      ...pinnedOptions(identity.certificate),
    },
    (response) => {
      response.on('data', (chunk) => events.push(`${chunk}`));
      response.on('end', () => (ended = true));
      response.on('error', () => (ended = true));
      response.on('close', () => (ended = true));
    }
  );
  outgoing.on('error', () => (ended = true));
  outgoing.end();
  return { events, hasEnded: () => ended, stop: () => outgoing.destroy() };
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

  it('pushes each change of the now playing to an approved device, and cuts off a revoked one', async () => {
    const { deviceId, secret } = approvedDevice();
    const stream = listen(deviceId, secret);
    await vi.waitFor(() => expect(stream.events.join('')).toContain('data: {"state":"idle"}'));

    host.setNowPlaying({ state: 'paused', title: 'Song', position: 4, at: 1000 });
    await vi.waitFor(() => expect(stream.events.join('')).toContain('"title":"Song"'));

    access.revoke(deviceId);
    host.setNowPlaying({ state: 'idle' });
    await vi.waitFor(() => expect(stream.hasEnded()).toBe(true));
    stream.stop();
  });

  it('ends the events of a device at once when the host revokes it, without waiting for the next event', async () => {
    const revoked = approvedDevice();
    const kept = approvedDevice();
    const stream = listen(revoked.deviceId, revoked.secret);
    const other = listen(kept.deviceId, kept.secret);
    await vi.waitFor(() => expect(stream.events.join('') && other.events.join('')).toContain('"state":"idle"'));

    access.revoke(revoked.deviceId);
    host.closeRevoked();

    await vi.waitFor(() => expect(stream.hasEnded()).toBe(true));
    expect(other.hasEnded()).toBe(false);
    stream.stop();
    other.stop();
  });

  it('ends the audio that is on its way to a device when the host blocks it', async () => {
    await host.close();
    let cancelled = false;
    host = await startHostServer({
      identity,
      access,
      loopbackOnly: true,
      // a track that never ends: only the block can stop it
      serveAudio: async () =>
        new Response(
          new ReadableStream({
            pull: (controller) => new Promise((resolve) => setTimeout(() => (controller.enqueue(new Uint8Array(1024)), resolve(undefined)), 5)),
            cancel: () => {
              cancelled = true;
            },
          })
        ),
    });
    const { deviceId, secret } = approvedDevice();
    host.setNowPlaying({ state: 'playing', title: 'Song', position: 0, at: 1000 }, '/music/song.flac');
    let received = 0;
    let ended = false;
    const outgoing = request(
      {
        host: '127.0.0.1',
        port: host.port,
        agent: false,
        path: '/remote/audio',
        headers: { 'x-tunelle-device': deviceId, authorization: `Bearer ${secret}` },
        ...pinnedOptions(identity.certificate),
      },
      (response) => {
        response.on('data', (chunk) => (received += chunk.length));
        response.on('close', () => (ended = true));
        response.on('error', () => undefined);
      }
    );
    outgoing.on('error', () => (ended = true));
    outgoing.end();
    await vi.waitFor(() => expect(received).toBeGreaterThan(0));

    access.block(deviceId);
    host.closeRevoked();

    await vi.waitFor(() => expect(ended).toBe(true));
    await vi.waitFor(() => expect(cancelled).toBe(true));
  });

  it('carries a command only for a control that was granted, and tells the page', async () => {
    const commands: unknown[] = [];
    await host.close();
    host = await startHostServer({ identity, access, loopbackOnly: true, onControl: (command) => commands.push(command) });
    const { deviceId, secret } = approvedDevice();
    const send = (body: object) =>
      call('POST', '/remote/control', { headers: { 'x-tunelle-device': deviceId, authorization: `Bearer ${secret}` }, body: JSON.stringify(body) });

    expect((await send({ control: 'seek', position: 30 })).status).toBe(403);
    access.setControls(deviceId, ['seek']);
    expect((await send({ control: 'seek', position: 30 })).status).toBe(200);
    expect((await send({ control: 'skip', direction: 'next' })).status).toBe(403);
    access.revoke(deviceId);
    expect((await send({ control: 'seek', position: 31 })).status).toBe(401);

    expect(commands).toEqual([{ control: 'seek', position: 30 }]);
  });

  it('relays the audio of the track that plays with its range, to an approved device only', async () => {
    await host.close();
    const data = Buffer.from('0123456789');
    host = await startHostServer({
      identity,
      access,
      loopbackOnly: true,
      serveAudio: async (_path, { headers }) => {
        const range = headers.get('range')?.match(/^bytes=(\d+)-(\d+)$/);
        return range
          ? new Response(data.subarray(Number(range[1]), Number(range[2]) + 1), {
              status: 206,
              headers: { 'content-range': `bytes ${range[1]}-${range[2]}/10` },
            })
          : new Response(data);
      },
    });
    const { deviceId, secret } = approvedDevice();
    const credentials = { 'x-tunelle-device': deviceId, authorization: `Bearer ${secret}` };
    const audio = (headers: Record<string, string>) =>
      new Promise<{ status: number; range?: string | string[]; text: string }>((resolve, reject) => {
        const outgoing = request(
          { host: '127.0.0.1', port: host.port, agent: false, path: '/remote/audio', headers, ...pinnedOptions(identity.certificate) },
          (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () =>
              resolve({ status: response.statusCode ?? 0, range: response.headers['content-range'], text: Buffer.concat(chunks).toString() })
            );
          }
        );
        outgoing.on('error', reject);
        outgoing.end();
      });

    expect((await audio(credentials)).status).toBe(404);
    host.setNowPlaying({ state: 'playing', title: 'Song', position: 0, at: 1000 }, '/music/song.flac');

    expect(await audio({ ...credentials, range: 'bytes=2-5' })).toEqual({ status: 206, range: 'bytes 2-5/10', text: '2345' });
    expect((await audio(credentials)).text).toBe('0123456789');
    expect((await audio({ 'x-tunelle-device': deviceId, authorization: 'Bearer wrong' })).status).toBe(401);
    expect((await nowPlaying(deviceId, secret)).body).not.toHaveProperty('path');
  });

  it('shows a hostile note as it was sent and an oversized one as an invalid request, without a prompt', async () => {
    expect((await ask(randomUUID(), '<img src=x onerror=alert(1)>')).status).toBe(202);
    expect(access.pending()[0].note).toBe('<img src=x onerror=alert(1)>');

    expect((await ask(randomUUID(), 'x'.repeat(201))).status).toBe(400);
    expect((await call('POST', '/remote/request', { body: JSON.stringify({ note: 'x'.repeat(5_000) }) })).status).toBe(400);
    // a body far over the cap may reset the connection (Windows) before the client reads the 400: it only must not make a prompt
    await call('POST', '/remote/request', { body: JSON.stringify({ deviceId: randomUUID(), deviceName: 'Speaker', note: 'x'.repeat(1_000_000) }) }).catch(
      () => undefined
    );
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
