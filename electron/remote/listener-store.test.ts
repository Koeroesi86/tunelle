import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs } from '../test-memory-fs';
import { createListenerStore } from './listener-store';

vi.mock('fs', () => ({ ...memoryFs.sync, default: memoryFs.sync }));
vi.mock('fs/promises', () => ({ ...memoryFs.promises, default: memoryFs.promises }));

describe('the store of the listener', () => {
  const appData = '/user-data';
  const pairing = { host: '192.168.1.5', port: 40000, certificate: 'PEM', secret: 'secret' };

  beforeEach(() => memoryFs.reset());

  it('has no host before the first approval', async () => {
    expect(await createListenerStore(appData).readPairing()).toBeUndefined();
  });

  it('gives the same device id on every start, and a valid one', async () => {
    const first = await createListenerStore(appData).deviceId();

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(await createListenerStore(appData).deviceId()).toBe(first);
  });

  it('keeps the host and the device id side by side', async () => {
    const store = createListenerStore(appData);
    const deviceId = await store.deviceId();
    await store.savePairing(pairing);

    expect(await store.readPairing()).toEqual(pairing);
    expect(await store.deviceId()).toBe(deviceId);
  });

  it('forgets the host but keeps the device id', async () => {
    const store = createListenerStore(appData);
    const deviceId = await store.deviceId();
    await store.savePairing(pairing);
    await store.clearPairing();

    expect(await store.readPairing()).toBeUndefined();
    expect(await store.deviceId()).toBe(deviceId);
  });

  it('drops a pairing with a wrong part and a file that is cut', async () => {
    memoryFs.sync.mkdirSync(join(appData, 'remote'));
    memoryFs.sync.writeFileSync(join(appData, 'remote', 'listener.json'), JSON.stringify({ pairing: { ...pairing, port: 80 } }));
    expect(await createListenerStore(appData).readPairing()).toBeUndefined();

    memoryFs.sync.writeFileSync(join(appData, 'remote', 'listener.json'), '{"pairing": {');
    expect(await createListenerStore(appData).readPairing()).toBeUndefined();
  });
});
