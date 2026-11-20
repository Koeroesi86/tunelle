import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeStorage } from 'electron';
import { memoryFs } from '../../test-memory-fs';
import { createSourceStore } from './server-store';

vi.mock('fs', () => ({ ...memoryFs.sync, default: memoryFs.sync }));
vi.mock('fs/promises', () => ({ ...memoryFs.promises, default: memoryFs.promises }));
vi.mock('electron', () => ({
  safeStorage: { isEncryptionAvailable: vi.fn(), getSelectedStorageBackend: vi.fn(), encryptString: vi.fn(), decryptString: vi.fn() },
}));

const server = { id: '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11', kind: 'subsonic', name: 'Home', url: 'https://music.example.com', username: 'me' } as const;
const appData = '/user-data';
const file = join(appData, 'sources', 'servers.json');

describe('the store of the servers', () => {
  beforeEach(() => {
    memoryFs.reset();
    vi.mocked(safeStorage.isEncryptionAvailable).mockReset().mockReturnValue(true);
    vi.mocked(safeStorage.getSelectedStorageBackend).mockReset().mockReturnValue('gnome_libsecret');
    vi.mocked(safeStorage.encryptString)
      .mockReset()
      .mockImplementation((text) => Buffer.from(`sealed:${text}`));
    vi.mocked(safeStorage.decryptString)
      .mockReset()
      .mockImplementation((data) => data.toString().replace('sealed:', ''));
  });

  it('has no servers at first', async () => {
    expect(await createSourceStore(appData).list()).toEqual([]);
  });

  it('keeps the password encrypted, and gives it back only to the main process', async () => {
    const store = createSourceStore(appData);
    const info = await store.save(server, 'secret');

    expect(info).toEqual({ ...server, protected: true });
    expect(await store.list()).toEqual([{ ...server, protected: true }]);
    expect(memoryFs.sync.readFileSync(file, 'utf8')).not.toContain('"secret"');
    expect(await store.get(server.id)).toEqual({ server, password: 'secret' });
  });

  it('keeps the password in plain text and says so when the system has no keyring', async () => {
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);
    const store = createSourceStore(appData);

    expect(await store.save(server, 'secret')).toMatchObject({ protected: false });
    expect(await store.get(server.id)).toEqual({ server, password: 'secret' });
  });

  it('does not trust the Linux backend that encrypts with a fixed password', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.mocked(safeStorage.getSelectedStorageBackend).mockReturnValue('basic_text');

    expect(await createSourceStore(appData).save(server, 'secret')).toMatchObject({ protected: false });
    expect(safeStorage.encryptString).not.toHaveBeenCalled();
  });

  it('replaces the server with the same id and removes one', async () => {
    const store = createSourceStore(appData);
    await store.save(server, 'one');
    await store.save({ ...server, name: 'Renamed' }, 'two');
    await store.save({ ...server, id: '9d1e0a2b-1c3d-4e5f-8a9b-0c1d2e3f4a5b' }, 'three');

    expect((await store.list()).map(({ name }) => name)).toEqual(['Renamed', 'Home']);
    expect((await store.get(server.id))?.password).toBe('two');

    await store.remove(server.id);
    expect((await store.list()).map(({ id }) => id)).toEqual(['9d1e0a2b-1c3d-4e5f-8a9b-0c1d2e3f4a5b']);
    expect(await store.get(server.id)).toBeUndefined();
  });

  it('leaves out an entry that is not valid and a file that is not JSON', async () => {
    memoryFs.sync.mkdirSync(join(appData, 'sources'));
    memoryFs.sync.writeFileSync(file, JSON.stringify({ servers: [{ id: 'x' }, { ...server, password: 'p', encrypted: false }] }));

    expect((await createSourceStore(appData).list()).map(({ id }) => id)).toEqual([server.id]);

    memoryFs.sync.writeFileSync(file, 'not json');
    expect(await createSourceStore(appData).list()).toEqual([]);
  });
});
