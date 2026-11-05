import { createHash } from 'crypto';
import { readdir, readFile } from 'fs/promises';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import checksums from './migrations-checksums.json';

const migrationsPath = resolve(__dirname, '../../migrations');

// line endings differ between the platforms that check the repository out
const checksumOf = (file: string) =>
  readFile(resolve(migrationsPath, file), 'utf8').then((sql) => createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex'));

describe('shipped migrations', () => {
  it('are the ones that were released: a migration that shipped is not edited, a new one gets its line in migrations-checksums.json', async () => {
    const files = (await readdir(migrationsPath)).filter((file) => file.endsWith('.sql')).sort();
    const actual = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await checksumOf(file)])));

    expect(actual).toEqual(checksums);
  });
});
