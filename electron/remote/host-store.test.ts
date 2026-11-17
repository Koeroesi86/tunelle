import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs } from '../test-memory-fs';
import { createHostStore } from './host-store';

vi.mock('fs', () => ({ ...memoryFs.sync, default: memoryFs.sync }));
vi.mock('fs/promises', () => ({ ...memoryFs.promises, default: memoryFs.promises }));

describe('the store of the host', () => {
  const appData = '/user-data';
  const folder = join(appData, 'remote');

  beforeEach(() => memoryFs.reset());

  describe('settings', () => {
    it('are off, named Tunelle and on the LAN when nothing was saved', async () => {
      expect(await createHostStore(appData).readSettings()).toEqual({ enabled: false, name: 'Tunelle', loopbackOnly: false });
    });

    it('come back as they were saved', async () => {
      const store = createHostStore(appData);
      await store.saveSettings({ enabled: true, name: 'Kitchen', loopbackOnly: true, port: 40000 });

      expect(await store.readSettings()).toEqual({ enabled: true, name: 'Kitchen', loopbackOnly: true, port: 40000 });
    });

    it('keep the parts that are valid when another part is not', async () => {
      memoryFs.sync.mkdirSync(folder);
      memoryFs.sync.writeFileSync(join(folder, 'host.json'), JSON.stringify({ enabled: true, name: '', port: 80, loopbackOnly: 'yes' }));

      expect(await createHostStore(appData).readSettings()).toEqual({ enabled: true, name: 'Tunelle', loopbackOnly: false });
    });

    it('are the defaults when the file is cut', async () => {
      memoryFs.sync.mkdirSync(folder);
      memoryFs.sync.writeFileSync(join(folder, 'host.json'), '{"enabled": tr');

      expect((await createHostStore(appData).readSettings()).enabled).toBe(false);
    });
  });

  describe('devices', () => {
    it('are an empty list when nothing was saved or the file is not a list', async () => {
      const store = createHostStore(appData);
      expect(await store.readDevices()).toEqual([]);

      memoryFs.sync.mkdirSync(folder);
      memoryFs.sync.writeFileSync(join(folder, 'devices.json'), '{"a":1}');
      expect(await store.readDevices()).toEqual([]);
    });

    it('come back as they were saved', async () => {
      const store = createHostStore(appData);
      const device = { id: crypto.randomUUID(), name: 'Speaker', secretHash: 'ab', blocked: false, controls: [] };
      await store.saveDevices([device]);

      expect(await store.readDevices()).toEqual([device]);
    });
  });

  describe('identity', () => {
    it('is made on the first call and the same one is read after it', async () => {
      const store = createHostStore(appData);
      const first = await store.identity('Tunelle');

      expect(first.certificate).toContain('BEGIN CERTIFICATE');
      expect(await createHostStore(appData).identity('Other name')).toEqual(first);
    });

    it('is made again when one of the two files is missing', async () => {
      const first = await createHostStore(appData).identity('Tunelle');
      memoryFs.sync.rmSync(join(folder, 'host-key.pem'));

      expect(await createHostStore(appData).identity('Tunelle')).not.toEqual(first);
    });
  });
});
