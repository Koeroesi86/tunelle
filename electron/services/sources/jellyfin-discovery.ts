import { createSocket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import { z } from 'zod';
import type { DiscoveredServer } from '@shared/schemas/sources';
import { discoveredServerSchema } from '@shared/schemas/sources';

const discoveryPort = 7359;
const question = Buffer.from('who is JellyfinServer?');
const listenFor = 2000;
const maxServers = 20;

/** The broadcast address of each network the machine is on, as a server on another one is not reached by the limited broadcast of the default route. See docs/app/jellyfin.md */
const broadcastAddresses = () => {
  const own = Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter(({ family, internal }) => family === 'IPv4' && !internal)
    .map(({ address, netmask }) => {
      const mask = netmask.split('.').map(Number);
      return address
        .split('.')
        .map((part, index) => (Number(part) | (~mask[index] & 255)) & 255)
        .join('.');
    });

  return [...new Set(['255.255.255.255', ...own])];
};

const answerSchema = z.object({ Address: discoveredServerSchema.shape.url, Id: z.string().min(1).max(100), Name: z.string().trim().min(1).max(100) });

const parse = (message: Buffer): DiscoveredServer[] => {
  const answer = answerSchema.safeParse(JSON.parse(message.toString('utf8')));
  return answer.success ? [{ id: answer.data.Id, name: answer.data.Name, url: answer.data.Address }] : [];
};

const safeParse = (message: Buffer) => {
  try {
    return parse(message);
  } catch {
    return [];
  }
};

/** Asks the network which Jellyfin servers there are (UDP broadcast to port 7359) and collects the answers for two seconds; a server that does not answer, or answers with something else, is not listed */
export const discoverJellyfin = () =>
  new Promise<DiscoveredServer[]>((resolve, reject) => {
    const socket = createSocket({ type: 'udp4', reuseAddr: true });
    const found = new Map<string, DiscoveredServer>();
    const finish = () => {
      socket.close();
      resolve([...found.values()]);
    };

    socket.on('error', (error) => {
      socket.close();
      reject(error);
    });
    socket.on('message', (message) =>
      safeParse(message)
        .filter(() => found.size < maxServers)
        .forEach((server) => found.set(server.id, server))
    );
    socket.bind(0, () => {
      socket.setBroadcast(true);
      broadcastAddresses().forEach((address) => socket.send(question, discoveryPort, address, () => undefined));
      setTimeout(finish, listenFor);
    });
  });
