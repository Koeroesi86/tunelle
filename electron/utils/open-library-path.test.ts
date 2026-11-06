import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { Database } from 'sqlite3';
import { getFolders } from '../repositories/library-repository';
import openLibraryPath from './open-library-path';

// the folders of the library come from a repository that is replaced, with the database it reads
vi.mock('sqlite3', () => ({ Database: class {} }));
vi.mock('../repositories/library-repository', () => ({ getFolders: vi.fn() }));

describe('openLibraryPath', () => {
  const library = path.resolve('music');
  const open = vi.fn<(target: string) => Promise<string>>();
  const database = new Database(':memory:');

  beforeEach(() => {
    open.mockReset().mockResolvedValue('');
    vi.mocked(getFolders)
      .mockReset()
      .mockResolvedValue([{ path: library, lastModified: 1 }]);
  });

  it('opens a library folder and the folders inside it', async () => {
    await openLibraryPath(database, library, open);
    await openLibraryPath(database, path.join(library, 'album'), open);

    expect(open.mock.calls).toEqual([[library], [path.join(library, 'album')]]);
    expect(getFolders).toHaveBeenCalledWith(database, ['path']);
  });

  it.each([
    ['a folder outside the library', path.resolve('other')],
    ['a sibling with the same prefix', `${library}-backup`],
    ['a path that climbs out of the library', path.join(library, '..', 'secrets')],
    ['a relative path', 'music'],
    ['something that is not a path', { path: library }],
  ])('ignores %s', async (_name, target) => {
    await openLibraryPath(database, target, open);

    expect(open).not.toHaveBeenCalled();
  });
});
