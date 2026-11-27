import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs } from '../../test-memory-fs';
import { createStoredAddresses } from './stored-addresses';

vi.mock('node:fs/promises', () => ({ ...memoryFs.promises, default: memoryFs.promises }));

const path = '/radio/addresses.json';

describe('stored addresses', () => {
  beforeEach(() => {
    memoryFs.reset();
    memoryFs.sync.mkdirSync('/radio');
  });

  it('keeps every address of writes that run at the same time', async () => {
    const addresses = createStoredAddresses(path, 10);

    await Promise.all([addresses.store([['a', 'https://a.example/']]), addresses.store([['b', 'https://b.example/']])]);

    expect([...(await createStoredAddresses(path, 10).read()).keys()]).toEqual(['a', 'b']);
  });

  it('drops the ones stored first past the limit, an address that is stored again counts as new', async () => {
    const addresses = createStoredAddresses(path, 2);
    await addresses.store([
      ['a', 'https://a.example/'],
      ['b', 'https://b.example/'],
    ]);
    await addresses.store([['a', 'https://a.example/new']]);
    await addresses.store([['c', 'https://c.example/']]);

    expect([...(await addresses.read())]).toEqual([
      ['a', 'https://a.example/new'],
      ['c', 'https://c.example/'],
    ]);
  });

  it.each(['not json', '[]', '"text"'])('reads nothing from a file that holds %s, and writes over it', async (content) => {
    await memoryFs.promises.writeFile(path, content);
    const addresses = createStoredAddresses(path, 10);

    expect(await addresses.read()).toEqual(new Map());
    await addresses.store([['a', 'https://a.example/']]);
    expect(await addresses.read()).toEqual(new Map([['a', 'https://a.example/']]));
  });

  it('leaves out what is not a web address', async () => {
    await memoryFs.promises.writeFile(path, JSON.stringify({ a: 'https://a.example/', b: 'file:///etc/passwd', c: 5 }));

    expect(await createStoredAddresses(path, 10).read()).toEqual(new Map([['a', 'https://a.example/']]));
  });

  it('does without a file that can not be written, or with none', async () => {
    const unwritable = createStoredAddresses('/missing/addresses.json', 10);

    await unwritable.store([['a', 'https://a.example/']]);
    await createStoredAddresses(undefined, 10).store([['a', 'https://a.example/']]);

    expect(await unwritable.read()).toEqual(new Map());
  });
});
