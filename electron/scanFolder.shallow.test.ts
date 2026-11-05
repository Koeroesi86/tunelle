import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WebContents } from 'electron';
import { parseFile } from 'music-metadata';
import scanFolder from './library/scanFolder';
import { createTestDatabase } from './test-database';

vi.mock('music-metadata', () => ({ parseFile: vi.fn() }));

describe('scanFolder that is not deep', () => {
  let root: string;
  const sender = { send: vi.fn() } as unknown as WebContents;
  const parsed = vi.mocked(parseFile);
  const read = () => parsed.mock.calls.map(([file]) => path.relative(root, file)).sort();

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-scan-shallow-'));
    fs.mkdirSync(path.join(root, 'live'));
    fs.writeFileSync(path.join(root, 'a.flac'), 'not audio');
    fs.writeFileSync(path.join(root, 'live', 'b.flac'), 'not audio');
    global._database = await createTestDatabase();
    global._appDataPath = root;
    parsed.mockReset().mockResolvedValue({ common: { artist: 'Artist', album: 'Album', title: 'Title' }, native: {}, format: { duration: 60 } } as never);
  });

  afterEach(() => {
    global._database = undefined;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reads the files of the folder and not the folders below it', async () => {
    await scanFolder(root, sender, false);

    expect(read()).toEqual(['a.flac']);
  });

  it('reads the folders below it by default', async () => {
    await scanFolder(root, sender);

    expect(read()).toEqual(['a.flac', path.join('live', 'b.flac')]);
  });
});
