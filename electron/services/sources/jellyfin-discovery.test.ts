import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sockets: FakeSocket[] = [];

class FakeSocket extends EventEmitter {
  sent: { message: Buffer; port: number; address: string }[] = [];
  closed = false;
  bind = vi.fn((_port: number, callback: () => void) => callback());
  setBroadcast = vi.fn();
  send = vi.fn((message: Buffer, port: number, address: string, callback: () => void) => {
    this.sent.push({ message, port, address });
    callback();
  });
  close = vi.fn(() => {
    this.closed = true;
  });
}

vi.mock('node:dgram', () => ({
  createSocket: () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  },
}));
vi.mock('node:os', () => ({
  networkInterfaces: () => ({
    lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1', netmask: '255.0.0.0' }],
    eth0: [
      { family: 'IPv4', internal: false, address: '192.168.1.20', netmask: '255.255.255.0' },
      { family: 'IPv6', internal: false, address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::' },
    ],
  }),
}));

const { discoverJellyfin } = await import('./jellyfin-discovery');

const reply = (body: unknown) => sockets[0].emit('message', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
const server = { Address: 'http://192.168.1.5:8096', Id: 'abc', Name: 'Film room', EndpointAddress: null };

describe('discoverJellyfin', () => {
  beforeEach(() => {
    sockets.length = 0;
    vi.useFakeTimers({ toFake: ['setTimeout'] });
  });
  afterEach(() => vi.useRealTimers());

  it('asks every network it is on, and the limited broadcast, for two seconds', async () => {
    const found = discoverJellyfin();
    reply(server);
    await vi.advanceTimersByTimeAsync(2000);

    expect(await found).toEqual([{ id: 'abc', name: 'Film room', url: 'http://192.168.1.5:8096' }]);
    expect(sockets[0].setBroadcast).toHaveBeenCalledWith(true);
    expect(sockets[0].sent.map(({ address }) => address)).toEqual(['255.255.255.255', '192.168.1.255']);
    expect(sockets[0].sent.every(({ port, message }) => port === 7359 && message.toString() === 'who is JellyfinServer?')).toBe(true);
    expect(sockets[0].closed).toBe(true);
  });

  it('lists a server once, whatever the number of its answers', async () => {
    const found = discoverJellyfin();
    reply(server);
    reply(server);
    await vi.advanceTimersByTimeAsync(2000);

    expect(await found).toHaveLength(1);
  });

  it.each([['not json'], ['{"Id":"x"}'], [JSON.stringify({ ...server, Address: 'ftp://host' })], [JSON.stringify({ ...server, Name: '' })], ['null']])(
    'leaves out an answer that is not a server: %s',
    async (body) => {
      const found = discoverJellyfin();
      reply(body);
      await vi.advanceTimersByTimeAsync(2000);

      expect(await found).toEqual([]);
    }
  );

  it('fails when the socket does', async () => {
    const found = discoverJellyfin();
    sockets[0].emit('error', new Error('network is unreachable'));

    await expect(found).rejects.toThrow('network is unreachable');
    expect(sockets[0].closed).toBe(true);
  });
});
