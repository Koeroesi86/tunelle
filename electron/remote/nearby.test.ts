import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NearbyHost } from '../../shared/schemas/remote-nearby';

const mocks = vi.hoisted(() => ({ browse: vi.fn(), stop: vi.fn(), logError: vi.fn() }));

vi.mock('./mdns', () => ({ browse: mocks.browse }));
vi.mock('../utils/log-error', () => ({ logError: mocks.logError }));

const host: NearbyHost = { id: 'tunelle-a', name: 'Kitchen', host: '192.168.1.30', port: 41000, version: '1' };

describe('the nearby list', () => {
  const changes: NearbyHost[][] = [];
  const create = async () =>
    (await import('./nearby')).createNearby(
      (hosts) => changes.push(hosts),
      () => '3f9a04c1'
    );

  beforeEach(() => {
    changes.length = 0;
    mocks.stop.mockReset().mockResolvedValue(undefined);
    mocks.logError.mockReset();
    mocks.browse.mockReset().mockImplementation(async (onChange: (hosts: NearbyHost[]) => void) => {
      onChange([host]);
      return { stop: mocks.stop };
    });
  });

  it('opens no socket until the list is shown, and one only', async () => {
    const nearby = await create();
    expect(mocks.browse).not.toHaveBeenCalled();

    await nearby.start();
    await nearby.start();

    expect(mocks.browse).toHaveBeenCalledTimes(1);
    expect(changes).toEqual([[host]]);
  });

  it('gives the browse the way to tell the id of this app, which can change while the list is shown', async () => {
    const nearby = await create();

    await nearby.start();

    expect(mocks.browse.mock.calls[0][1]()).toBe('3f9a04c1');
  });

  it('closes the socket and empties the list when it is hidden', async () => {
    const nearby = await create();
    await nearby.start();
    await nearby.stop();

    expect(mocks.stop).toHaveBeenCalledTimes(1);
    expect(changes.at(-1)).toEqual([]);
  });

  it('leaves no socket behind when it is shown and hidden at once', async () => {
    const nearby = await create();

    await Promise.all([nearby.start(), nearby.stop(), nearby.start(), nearby.stop()]);

    expect(mocks.browse).toHaveBeenCalledTimes(2);
    expect(mocks.stop).toHaveBeenCalledTimes(2);
  });

  it('shows an empty list and logs it when the sockets cannot be opened, and tries again the next time', async () => {
    mocks.browse.mockRejectedValueOnce(new Error('EACCES'));
    const nearby = await create();

    await nearby.start();
    expect(mocks.logError).toHaveBeenCalledWith(expect.objectContaining({ message: 'EACCES' }));

    await nearby.start();
    expect(mocks.browse).toHaveBeenCalledTimes(2);
  });
});
