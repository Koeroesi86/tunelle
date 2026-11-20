import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { safeStorage } from 'electron';
import { z } from 'zod';
import { sourceServerSchema, type SourceServer, type SourceServerInfo } from '@shared/schemas/sources';

const storedSchema = sourceServerSchema.extend({
  /** Base64 of the encrypted password, or the password itself when `encrypted` is false */
  password: z.string(),
  encrypted: z.boolean(),
});
type Stored = z.infer<typeof storedSchema>;

// an entry that is not valid is dropped and the others stay
const fileSchema = z.object({
  servers: z.array(z.unknown()).transform((entries) => entries.flatMap((entry) => storedSchema.safeParse(entry).data ?? [])),
});

/** The Linux backend `basic_text` encrypts with a fixed password, which protects nothing. See docs/app/sources.md */
const hasKeyring = () => safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text');

const seal = (password: string) =>
  hasKeyring() ? { password: safeStorage.encryptString(password).toString('base64'), encrypted: true } : { password, encrypted: false };

const open = ({ password, encrypted }: Stored) => (encrypted ? safeStorage.decryptString(Buffer.from(password, 'base64')) : password);

// the schema of the server leaves out the password
const toServer = (stored: Stored): SourceServer => sourceServerSchema.parse(stored);

const toInfo = (stored: Stored): SourceServerInfo => ({ ...toServer(stored), protected: stored.encrypted });

/** The servers of the user and their passwords. The file is only for the user, and the page never gets a password. See docs/app/sources.md */
export const createServerStore = (appData: string) => {
  const folder = join(appData, 'sources');
  const file = join(folder, 'servers.json');

  const read = () =>
    readFile(file, 'utf8')
      .then((text): unknown => JSON.parse(text))
      .catch(() => ({}))
      .then((stored) => fileSchema.safeParse(stored).data?.servers ?? []);
  const write = (servers: Stored[]) => mkdir(folder, { recursive: true }).then(() => writeFile(file, JSON.stringify({ servers }), { mode: 0o600 }));

  return {
    list: () => read().then((servers) => servers.map(toInfo)),
    /** The server with its password, for the main process only */
    get: (id: string) =>
      read().then((servers) =>
        servers
          .filter((stored) => stored.id === id)
          .map((stored) => ({ server: toServer(stored), password: open(stored) }))
          .at(0)
      ),
    /** Adds the server or replaces the one with its id */
    save: async (server: SourceServer, password: string) => {
      const stored: Stored = { ...server, ...seal(password) };
      await write([...(await read()).filter(({ id }) => id !== server.id), stored]);
      return toInfo(stored);
    },
    remove: async (id: string) => write((await read()).filter((stored) => stored.id !== id)),
  };
};
