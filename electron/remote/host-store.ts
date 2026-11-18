import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import type { StoredDevice } from './access';
import { DEFAULT_MAX_LISTENERS, MAX_LISTENERS } from '../../shared/constants/remote-limits';
import { createHostIdentity, type HostIdentity } from './certificate';

/** The rules of each setting, which a change from the page must meet and a stored file may fail one by one */
export const hostFields = {
  enabled: z.boolean(),
  name: z.string().trim().min(1).max(60),
  loopbackOnly: z.boolean(),
  port: z.number().int().min(1024).max(65535),
  maxListeners: z.number().int().min(1).max(MAX_LISTENERS),
};

const hostSettingsSchema = z
  .object({
    /** Off until the user turns it on: nothing listens and nothing is advertised before */
    enabled: hostFields.enabled.catch(false),
    name: hostFields.name.catch('Tunelle'),
    loopbackOnly: hostFields.loopbackOnly.catch(false),
    /** The port of the last start, reused until it is taken; undefined before the first start */
    port: hostFields.port.optional().catch(undefined),
    maxListeners: hostFields.maxListeners.catch(DEFAULT_MAX_LISTENERS),
  })
  .catch({ enabled: false, name: 'Tunelle', loopbackOnly: false, maxListeners: DEFAULT_MAX_LISTENERS });

export type HostSettings = z.infer<typeof hostSettingsSchema>;

const devicesSchema = z.array(z.unknown()).catch([]);

const folderOf = (appData: string) => join(appData, 'remote');

const readJson = (file: string): Promise<unknown> =>
  readFile(file, 'utf8').then(
    (text): unknown => JSON.parse(text),
    () => undefined
  );

// a file that is cut or not JSON counts as missing: the host starts from its defaults instead of failing
const readJsonSafely = (file: string) => readJson(file).catch(() => undefined);

/** What the host keeps between starts: its settings, its certificate and the approved devices. See docs/app/remote-access-discovery.md */
export const createHostStore = (appData: string) => {
  const folder = folderOf(appData);
  const settingsFile = join(folder, 'host.json');
  const devicesFile = join(folder, 'devices.json');
  const certificateFile = join(folder, 'host-certificate.pem');
  const keyFile = join(folder, 'host-key.pem');
  const write = (file: string, data: string, mode = 0o644) => mkdir(folder, { recursive: true }).then(() => writeFile(file, data, { mode }));

  return {
    readSettings: () => readJsonSafely(settingsFile).then((stored) => hostSettingsSchema.parse(stored ?? {})),
    saveSettings: (settings: HostSettings) => write(settingsFile, JSON.stringify(settings)),
    /** The stored list as it is: AccessControl reads it through its own schema and drops what does not fit */
    readDevices: () => readJsonSafely(devicesFile).then((stored) => devicesSchema.parse(stored)),
    saveDevices: (devices: StoredDevice[]) => write(devicesFile, JSON.stringify(devices)),
    /** The certificate of the host, made on the first start: deleting the files makes a new one and listeners ask again */
    identity: async (name: string): Promise<HostIdentity> => {
      const [certificate, key] = await Promise.all([readFile(certificateFile, 'utf8').catch(() => ''), readFile(keyFile, 'utf8').catch(() => '')]);
      if (certificate && key) return { certificate, key };

      const created = createHostIdentity(name);
      await write(keyFile, created.key, 0o600);
      await write(certificateFile, created.certificate);
      return created;
    },
  };
};

export type HostStore = ReturnType<typeof createHostStore>;
