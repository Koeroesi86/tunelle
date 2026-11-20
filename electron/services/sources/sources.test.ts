import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSourceStore } from './server-store';
import { createSubsonicClient } from './subsonic-client';
import { createSources } from './sources';

vi.mock('./server-store', () => ({ createSourceStore: vi.fn() }));
vi.mock('./subsonic-client', () => ({ createSubsonicClient: vi.fn() }));

const server = { id: '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11', kind: 'subsonic', name: 'Home', url: 'https://music.example.com', username: 'me' } as const;
const store = { list: vi.fn(), get: vi.fn(), save: vi.fn(), remove: vi.fn() };

describe('the sources', () => {
  beforeEach(() => {
    Object.values(store).forEach((fn) => fn.mockReset());
    store.get.mockResolvedValue({ server, password: 'sesame' });
    vi.mocked(createSourceStore)
      .mockReset()
      .mockReturnValue(store as never);
    vi.mocked(createSubsonicClient)
      .mockReset()
      .mockImplementation(() => ({ ping: vi.fn().mockResolvedValue(undefined) }) as never);
  });

  it('keeps its servers in the app data folder', () => {
    createSources('/user-data', 'Tunelle/1.0');

    expect(createSourceStore).toHaveBeenCalledWith('/user-data');
  });

  it('makes the client of a server with its password and the user agent, once', async () => {
    const sources = createSources('/user-data', 'Tunelle/1.0');

    const first = await sources.clientOf(server.id);
    const second = await sources.clientOf(server.id);

    expect(second).toBe(first);
    expect(createSubsonicClient).toHaveBeenCalledTimes(1);
    expect(createSubsonicClient).toHaveBeenCalledWith(server, 'sesame', 'Tunelle/1.0');
    expect(store.get).toHaveBeenCalledTimes(1);
  });

  it('has no client for a server that is not known, and asks again the next time', async () => {
    store.get.mockResolvedValueOnce(undefined);
    const sources = createSources('/user-data', 'Tunelle/1.0');

    expect(await sources.clientOf('unknown')).toBeUndefined();
    expect(await sources.clientOf('unknown')).toBeDefined();
  });

  it('makes a new client after the server was saved with another address or password', async () => {
    const sources = createSources('/user-data', 'Tunelle/1.0');
    const before = await sources.clientOf(server.id);

    await sources.save(server, 'new');

    expect(store.save).toHaveBeenCalledWith(server, 'new');
    expect(await sources.clientOf(server.id)).not.toBe(before);
  });

  it('forgets the client of a server that is removed', async () => {
    const sources = createSources('/user-data', 'Tunelle/1.0');
    await sources.clientOf(server.id);
    store.get.mockResolvedValue(undefined);

    await sources.remove(server.id);

    expect(store.remove).toHaveBeenCalledWith(server.id);
    expect(await sources.clientOf(server.id)).toBeUndefined();
  });

  it('checks the credentials with a client of their own, which is not kept', async () => {
    const sources = createSources('/user-data', 'Tunelle/1.0');

    await sources.check(server, 'typed');

    expect(createSubsonicClient).toHaveBeenCalledWith(server, 'typed', 'Tunelle/1.0');
    await sources.clientOf(server.id);
    expect(createSubsonicClient).toHaveBeenCalledTimes(2);
  });

  it('lists the servers of the store', () => {
    expect(createSources('/user-data', 'Tunelle/1.0').list).toBe(store.list);
  });
});
