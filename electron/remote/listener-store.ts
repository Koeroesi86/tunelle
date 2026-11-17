import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';

const pairingSchema = z.object({
  host: z.string().min(1).max(253),
  port: z.number().int().min(1024).max(65535),
  /** The certificate of the host that the user approved the code of; every later call is pinned to it */
  certificate: z.string().min(1),
  secret: z.string().min(1),
});
export type Pairing = z.infer<typeof pairingSchema>;

const listenerFileSchema = z.object({
  deviceId: z.uuid().optional().catch(undefined),
  pairing: pairingSchema.optional().catch(undefined),
});

/** What the listener keeps between starts: its device id and the host it was approved by. See docs/app/remote-access-discovery.md */
export const createListenerStore = (appData: string) => {
  const folder = join(appData, 'remote');
  const file = join(folder, 'listener.json');

  const read = () =>
    readFile(file, 'utf8')
      .then((text): unknown => JSON.parse(text))
      .catch(() => undefined)
      .then((stored) => listenerFileSchema.parse(stored ?? {}));
  // the secret of the host is in this file, so only the user reads it
  const write = (content: z.infer<typeof listenerFileSchema>) =>
    mkdir(folder, { recursive: true }).then(() => writeFile(file, JSON.stringify(content), { mode: 0o600 }));

  return {
    readPairing: () => read().then(({ pairing }) => pairing),
    /** The same id on every start, so a host sees one device and not a new one each time */
    deviceId: async () => {
      const stored = await read();
      if (stored.deviceId) return stored.deviceId;

      const deviceId = randomUUID();
      await write({ ...stored, deviceId });
      return deviceId;
    },
    savePairing: async (pairing: Pairing) => write({ ...(await read()), pairing }),
    clearPairing: async () => write({ ...(await read()), pairing: undefined }),
  };
};

export type ListenerStore = ReturnType<typeof createListenerStore>;
