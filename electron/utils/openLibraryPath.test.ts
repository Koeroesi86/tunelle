import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import type { Database } from 'sqlite3';
import executeQuery from '../database/executeQuery';
import openLibraryPath from './openLibraryPath';
import { createTestDatabase } from '../test-database';

describe('openLibraryPath', () => {
  const library = path.resolve('music');
  const open = vi.fn<(target: string) => Promise<string>>();
  let database: Database;

  beforeEach(async () => {
    open.mockReset().mockResolvedValue('');
    database = await createTestDatabase();
    await executeQuery(database, { query: 'INSERT INTO folders (path, lastModified) VALUES (?, 1)', variables: [library] });
  });

  it('opens a library folder and the folders inside it', async () => {
    await openLibraryPath(database, library, open);
    await openLibraryPath(database, path.join(library, 'album'), open);

    expect(open.mock.calls).toEqual([[library], [path.join(library, 'album')]]);
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
