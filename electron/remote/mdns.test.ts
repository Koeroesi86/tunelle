import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeMessage, encodeA, encodeName, encodeQuery, encodeResponse, encodeSrv, encodeTxt, RecordType } from './dns-packet';

class FakeSocket extends EventEmitter {
  static all: FakeSocket[] = [];
  static failures: Error[] = [];
  sent: Buffer[] = [];
  membership: (string | undefined)[] = [];
  bind = vi.fn((_port: number, callback: () => void) => {
    const failure = FakeSocket.failures.shift();
    return failure ? queueMicrotask(() => this.emit('error', failure)) : callback();
  });
  addMembership = vi.fn((_group: string, address?: string) => void this.membership.push(address));
  setMulticastInterface = vi.fn();
  setMulticastTTL = vi.fn();
  setMulticastLoopback = vi.fn();
  send = vi.fn((message: Buffer, _port: number, _group: string, callback: (error?: Error) => void) => {
    this.sent.push(message);
    callback();
  });
  close = vi.fn((callback: () => void) => callback());

  constructor() {
    super();
    FakeSocket.all.push(this);
  }
}

const mocks = vi.hoisted(() => ({ interfaces: vi.fn(), logError: vi.fn() }));

vi.mock('node:dgram', () => ({ createSocket: () => new FakeSocket() }));
vi.mock('node:os', () => ({ networkInterfaces: mocks.interfaces }));
vi.mock('../utils/log-error', () => ({ logError: mocks.logError }));

const SERVICE = '_tunelle._tcp.local';
const INSTANCE = `tunelle-3f9a04c1.${SERVICE}`;
const advertisement = { id: '3f9a04c1', name: 'Kitchen', port: 41000, version: '26.11.5' };
const wifi = { family: 'IPv4', internal: false, address: '192.168.1.20' };

const lan = () =>
  mocks.interfaces.mockReturnValue({
    lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    wlan0: [wifi, { family: 'IPv6', internal: false, address: 'fe80::1' }],
  });
const records = (socket: FakeSocket) => socket.sent.flatMap((message) => decodeMessage(message)?.records ?? []);
const answer = (ttl = 120, port = 41000, protocol = '1') =>
  encodeResponse(
    [
      { name: SERVICE, type: RecordType.PTR, data: encodeName(INSTANCE) },
      { name: INSTANCE, type: RecordType.SRV, data: encodeSrv(port, 'tunelle-3f9a04c1.local') },
      { name: INSTANCE, type: RecordType.TXT, data: encodeTxt({ name: 'Kitchen', version: '26.11.5', ...(protocol ? { protocol } : {}) }) },
      { name: 'tunelle-3f9a04c1.local', type: RecordType.A, data: encodeA('192.168.1.30') },
    ],
    ttl
  );

describe('mdns', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    vi.setSystemTime(0);
    FakeSocket.all = [];
    FakeSocket.failures = [];
    mocks.logError.mockReset();
    lan();
  });

  afterEach(() => vi.useRealTimers());

  describe('advertise', () => {
    it('joins the group on each interface that is up and not loopback', async () => {
      mocks.interfaces.mockReturnValue({ wlan0: [wifi], eth0: [{ family: 'IPv4', internal: false, address: '10.0.0.5' }] });
      const { advertise } = await import('./mdns');
      await advertise(advertisement);

      expect(FakeSocket.all.map((socket) => socket.membership)).toEqual([['192.168.1.20'], ['10.0.0.5']]);
      expect(FakeSocket.all[0].setMulticastInterface).toHaveBeenCalledWith('192.168.1.20');
    });

    it('uses one socket on the default interface when only loopback is up', async () => {
      mocks.interfaces.mockReturnValue({ lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }] });
      const { advertise } = await import('./mdns');
      await advertise(advertisement);

      expect(FakeSocket.all).toHaveLength(1);
      expect(FakeSocket.all[0].setMulticastInterface).not.toHaveBeenCalled();
    });

    it('announces at once and a second later with the four records and the address of the interface', async () => {
      const { advertise } = await import('./mdns');
      await advertise(advertisement);
      await vi.advanceTimersByTimeAsync(1000);

      const [socket] = FakeSocket.all;
      expect(socket.sent).toHaveLength(2);
      expect(records(socket).slice(0, 4)).toEqual([
        { kind: 'ptr', name: SERVICE, ttl: 120, target: INSTANCE },
        { kind: 'srv', name: INSTANCE, ttl: 120, port: 41000, target: 'tunelle-3f9a04c1.local' },
        { kind: 'txt', name: INSTANCE, ttl: 120, entries: { name: 'Kitchen', version: '26.11.5', port: '41000', approval: 'request', protocol: '1' } },
        { kind: 'a', name: 'tunelle-3f9a04c1.local', ttl: 120, address: '192.168.1.20' },
      ]);
    });

    it('answers the question for the service and ignores any other packet', async () => {
      const { advertise } = await import('./mdns');
      await advertise(advertisement);
      await vi.advanceTimersByTimeAsync(1000);
      const [socket] = FakeSocket.all;
      const before = socket.sent.length;

      socket.emit('message', encodeQuery('_http._tcp.local', RecordType.PTR));
      socket.emit('message', Buffer.from([1, 2, 3]));
      socket.emit('message', answer());
      await vi.advanceTimersByTimeAsync(0);
      expect(socket.sent).toHaveLength(before);

      socket.emit('message', encodeQuery(SERVICE, RecordType.PTR));
      await vi.advanceTimersByTimeAsync(0);
      expect(socket.sent).toHaveLength(before + 1);
    });

    it('refreshes before the records end', async () => {
      const { advertise } = await import('./mdns');
      await advertise(advertisement);
      await vi.advanceTimersByTimeAsync(1000);
      const [socket] = FakeSocket.all;
      const before = socket.sent.length;

      await vi.advanceTimersByTimeAsync(96_000);

      expect(socket.sent.length).toBe(before + 1);
    });

    it('says goodbye with a ttl of 0 and closes the sockets when it stops', async () => {
      const { advertise } = await import('./mdns');
      const advertising = await advertise(advertisement);
      await advertising.stop();
      const sent = FakeSocket.all[0].sent.length;
      await vi.advanceTimersByTimeAsync(200_000);

      const [socket] = FakeSocket.all;
      expect(
        records(socket)
          .slice(-4)
          .map(({ ttl }) => ttl)
      ).toEqual([0, 0, 0, 0]);
      expect(socket.close).toHaveBeenCalledTimes(1);
      // nothing more is announced after the stop
      expect(socket.sent).toHaveLength(sent);
    });

    it('works with the interfaces that bound and fails when none did', async () => {
      const { advertise } = await import('./mdns');
      mocks.interfaces.mockReturnValue({ wlan0: [wifi], eth0: [{ family: 'IPv4', internal: false, address: '10.0.0.5' }] });
      FakeSocket.failures = [new Error('EADDRINUSE')];

      await advertise(advertisement);
      expect(FakeSocket.all).toHaveLength(2);

      FakeSocket.failures = [new Error('EACCES'), new Error('EACCES')];
      await expect(advertise(advertisement)).rejects.toThrow('EACCES');
    });

    it('writes the error of a socket to the log and does not throw it', async () => {
      const { advertise } = await import('./mdns');
      await advertise(advertisement);

      FakeSocket.all[0].emit('error', new Error('ENETUNREACH'));

      expect(mocks.logError).toHaveBeenCalledWith(expect.objectContaining({ message: 'ENETUNREACH' }));
    });
  });

  describe('browse', () => {
    const open = async (ownId?: string) => {
      const { browse } = await import('./mdns');
      const changes: unknown[] = [];
      const browser = await browse(
        (hosts) => changes.push(hosts),
        () => ownId
      );
      return { browser, changes, socket: FakeSocket.all[0] };
    };

    it('asks for the service, then after 1 s, 2 s, 4 s and so on, up to a minute', async () => {
      const { socket } = await open();
      const asked = () => socket.sent.length;

      expect(asked()).toBe(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(asked()).toBe(2);
      await vi.advanceTimersByTimeAsync(2000);
      expect(asked()).toBe(3);
      await vi.advanceTimersByTimeAsync(4000);
      expect(asked()).toBe(4);
      await vi.advanceTimersByTimeAsync(8000 + 16_000 + 32_000 + 60_000);
      expect(asked()).toBe(8);
      expect(decodeMessage(socket.sent[0])?.questions).toEqual([{ name: SERVICE, type: RecordType.PTR }]);
    });

    it('lists a host once its address, port and name are known, and tells only when the list changes', async () => {
      const { socket, changes } = await open();

      socket.emit('message', answer());
      socket.emit('message', answer());

      expect(changes).toEqual([[{ id: 'tunelle-3f9a04c1', name: 'Kitchen', host: '192.168.1.30', port: 41000, version: '26.11.5' }]]);
    });

    it('does not list a host that advertises another protocol or none', async () => {
      const { socket, changes } = await open();

      socket.emit('message', answer(120, 41000, '2'));
      socket.emit('message', answer(120, 41000, ''));

      expect(changes).toEqual([]);
    });

    it('does not list the host of this app, by the id it advertises, and lists another one', async () => {
      const own = await open('3f9a04c1');
      own.socket.emit('message', answer());
      expect(own.changes).toEqual([]);

      FakeSocket.all.length = 0;
      const other = await open('00000000');
      other.socket.emit('message', answer());
      expect(other.changes).toHaveLength(1);
    });

    it('does not list a host that lacks an address', async () => {
      const { socket, changes } = await open();

      socket.emit('message', encodeResponse([{ name: SERVICE, type: RecordType.PTR, data: encodeName(INSTANCE) }], 120));

      expect(changes).toEqual([]);
    });

    it('removes the host at its goodbye', async () => {
      const { socket, changes } = await open();

      socket.emit('message', answer());
      socket.emit('message', answer(0));

      expect(changes.at(-1)).toEqual([]);
    });

    it('removes a host that is not heard from when its records end', async () => {
      const { socket, changes } = await open();

      socket.emit('message', answer(30));
      await vi.advanceTimersByTimeAsync(29_000);
      expect(changes).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(11_000);

      expect(changes.at(-1)).toEqual([]);
    });

    it('takes the later port of a host that restarted on another one', async () => {
      const { socket, changes } = await open();

      socket.emit('message', answer(120, 41000));
      socket.emit('message', answer(120, 42000));

      expect(changes.at(-1)).toEqual([expect.objectContaining({ port: 42000 })]);
    });

    it('keeps a limit on what a flood of records fills', async () => {
      const { socket, changes } = await open();
      const flood = Array.from({ length: 400 }, (_, index) => ({ name: SERVICE, type: RecordType.PTR, data: encodeName(`tunelle-${index}.${SERVICE}`) }));

      socket.emit('message', encodeResponse(flood, 120));
      socket.emit('message', answer());

      // the made up names have no address, and the real one found no room
      expect(changes).toEqual([]);
    });

    it('ignores a packet that is no message', async () => {
      const { socket, changes } = await open();

      socket.emit('message', Buffer.from([0, 1]));

      expect(changes).toEqual([]);
    });

    it('stops asking and closes the sockets', async () => {
      const { browser, socket } = await open();

      await browser.stop();
      await vi.advanceTimersByTimeAsync(120_000);

      expect(socket.sent).toHaveLength(1);
      expect(socket.close).toHaveBeenCalledTimes(1);
    });
  });
});
