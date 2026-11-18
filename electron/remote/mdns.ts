import { createSocket, type Socket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import {
  decodeMessage,
  encodeA,
  encodeName,
  encodeQuery,
  encodeResponse,
  encodeSrv,
  encodeTxt,
  RecordType,
  type DecodedRecord,
  type DnsRecord,
} from './dns-packet';
import type { NearbyHost } from '../../shared/schemas/remote-nearby';
import { logError } from '../utils/log-error';

const SERVICE = '_tunelle._tcp.local';
const GROUP = '224.0.0.251';
const MDNS_PORT = 5353;
const TTL_SECONDS = 120;
const ANY = 255;
// a flood of made up records from the network must not grow the cache without end
const MAX_CACHED_RECORDS = 256;
const MAX_NAME_LENGTH = 60;
const ANNOUNCE_DELAYS = [0, 1000];
const FIRST_QUERY_DELAY = 1000;
const MAX_QUERY_DELAY = 60_000;
const PRUNE_INTERVAL = 10_000;

export interface Advertisement {
  /** What makes the instance name of this host differ from another one called the same */
  id: string;
  name: string;
  port: number;
  version: string;
}

interface Channel {
  send: (message: Buffer) => Promise<void>;
  close: () => Promise<void>;
}

/** The IPv4 addresses of the interfaces that are up and not loopback: a VPN or docker interface is listed too, which is why the A records are for the listener to try */
const lanAddresses = () =>
  Object.values(networkInterfaces())
    .flatMap((list) => list ?? [])
    .filter(({ family, internal }) => family === 'IPv4' && !internal)
    .map(({ address }) => address);

const bind = (socket: Socket) =>
  new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(MDNS_PORT, resolve);
  });

const openSocket = async (address: string | undefined, onMessage: (message: Buffer) => void) => {
  const socket = createSocket({ type: 'udp4', reuseAddr: true });
  // an error of a socket ends that socket: an unhandled one would open the error dialog of the app
  socket.on('error', logError);
  socket.on('message', onMessage);
  await bind(socket);
  socket.addMembership(GROUP, address);
  if (address) socket.setMulticastInterface(address);
  socket.setMulticastTTL(255);
  socket.setMulticastLoopback(true);
  return socket;
};

const sendOn = (socket: Socket, message: Buffer) =>
  new Promise<void>((resolve) => socket.send(message, MDNS_PORT, GROUP, (error) => resolve(error ? logError(error) : undefined)));

const closeSocket = (socket: Socket) => new Promise<void>((resolve) => socket.close(resolve));

/** One socket for each interface, as a reply on the wrong one (VPN, docker) reaches nobody; with no interface up (a machine with loopback only) one on the default. See docs/app/remote-access-discovery.md */
const openChannel = async (onMessage: (message: Buffer) => void): Promise<Channel> => {
  const addresses = lanAddresses();
  const opened = await Promise.allSettled((addresses.length > 0 ? addresses : [undefined]).map((address) => openSocket(address, onMessage)));
  const sockets = opened.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  const failure = opened.find((result) => result.status === 'rejected');

  if (sockets.length === 0) throw failure?.reason ?? new Error('No socket for mDNS');
  return {
    send: (message) => Promise.all(sockets.map((socket) => sendOn(socket, message))).then(() => undefined),
    close: () => Promise.all(sockets.map(closeSocket)).then(() => undefined),
  };
};

const isAskedFor = (message: Buffer) =>
  decodeMessage(message)?.questions.some(({ name, type }) => name.toLowerCase() === SERVICE && (type === RecordType.PTR || type === ANY)) ?? false;

/**
 * Tells the network that this host is there, while it runs: answers the questions for `_tunelle._tcp`, announces twice at the start, refreshes before
 * the records end and says goodbye (a ttl of 0) when it stops. See docs/app/remote-access-discovery.md
 */
export const advertise = async ({ id, name, port, version }: Advertisement) => {
  const instance = `tunelle-${id}.${SERVICE}`;
  const target = `tunelle-${id}.local`;
  const records = (): DnsRecord[] => [
    { name: SERVICE, type: RecordType.PTR, data: encodeName(instance) },
    { name: instance, type: RecordType.SRV, data: encodeSrv(port, target) },
    { name: instance, type: RecordType.TXT, data: encodeTxt({ name, version, port: String(port), approval: 'request' }) },
    ...lanAddresses().map((address) => ({ name: target, type: RecordType.A, data: encodeA(address) })),
  ];
  const announce = (ttl: number) => channel.send(encodeResponse(records(), ttl));

  const channel = await openChannel((message) => {
    if (isAskedFor(message)) announce(TTL_SECONDS).catch(logError);
  });
  const timers = [
    ...ANNOUNCE_DELAYS.map((delay) => setTimeout(() => announce(TTL_SECONDS).catch(logError), delay)),
    setInterval(() => announce(TTL_SECONDS).catch(logError), TTL_SECONDS * 800),
  ];

  return {
    stop: async () => {
      timers.forEach((timer) => (clearTimeout(timer), clearInterval(timer)));
      await announce(0).catch(logError);
      await channel.close();
    },
  };
};

interface Cached {
  record: DecodedRecord;
  expires: number;
}

const keyOf = (record: DecodedRecord) =>
  [record.kind, record.name, record.kind === 'ptr' ? record.target : record.kind === 'a' ? record.address : ''].join('|');

const hostsOf = (cache: Map<string, Cached>): NearbyHost[] => {
  const records = [...cache.values()].map(({ record }) => record);

  return records
    .flatMap((record) => (record.kind === 'ptr' && record.name === SERVICE ? [record.target] : []))
    .flatMap((instance) => {
      const srv = records.find((record) => record.kind === 'srv' && record.name === instance);
      const txt = records.find((record) => record.kind === 'txt' && record.name === instance);
      const address = records.find((record) => record.kind === 'a' && srv?.kind === 'srv' && record.name === srv.target);
      if (srv?.kind !== 'srv' || address?.kind !== 'a') return [];

      return [
        {
          id: instance.split('.')[0],
          name: (txt?.kind === 'txt' && txt.entries.name ? txt.entries.name : instance.split('.')[0]).slice(0, MAX_NAME_LENGTH),
          host: address.address,
          port: srv.port,
          version: txt?.kind === 'txt' ? (txt.entries.version ?? '').slice(0, MAX_NAME_LENGTH) : '',
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
};

/**
 * Looks for other Tunelles on the network while it runs: asks at 1 s and then less and less often, reads the answers (and the ones that others ask for)
 * and tells which hosts are there when that changes. A goodbye removes a host at once, a host that is not heard from leaves when its records end.
 */
export const browse = async (onChange: (hosts: NearbyHost[]) => void) => {
  const cache = new Map<string, Cached>();
  let shown = '[]';

  const publish = () => {
    const hosts = hostsOf(cache);
    const next = JSON.stringify(hosts);
    if (next === shown) return;
    shown = next;
    onChange(hosts);
  };

  const absorb = (record: DecodedRecord) => {
    if (record.ttl === 0) return cache.delete(keyOf(record));
    if (cache.size >= MAX_CACHED_RECORDS && !cache.has(keyOf(record))) return;
    cache.set(keyOf(record), { record, expires: Date.now() + record.ttl * 1000 });
  };

  const channel = await openChannel((message) => {
    decodeMessage(message)?.records.forEach(absorb);
    publish();
  });

  const query = encodeQuery(SERVICE, RecordType.PTR);
  let delay = FIRST_QUERY_DELAY;
  let timer: NodeJS.Timeout | undefined;
  const ask = () => {
    channel.send(query).catch(logError);
    timer = setTimeout(ask, delay);
    delay = Math.min(delay * 2, MAX_QUERY_DELAY);
  };
  ask();

  const prune = setInterval(() => {
    [...cache].filter(([, { expires }]) => expires <= Date.now()).forEach(([key]) => cache.delete(key));
    publish();
  }, PRUNE_INTERVAL);

  return {
    stop: async () => {
      clearTimeout(timer);
      clearInterval(prune);
      await channel.close();
    },
  };
};
