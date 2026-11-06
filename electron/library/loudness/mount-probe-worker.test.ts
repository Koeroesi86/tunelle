import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { answer } from './mount-probe-worker';

describe('the worker that checks a drive', () => {
  let folder: string;

  beforeAll(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-probe-'));
    fs.writeFileSync(path.join(folder, 'a.flac'), 'data');
    fs.writeFileSync(path.join(folder, 'empty.flac'), '');
  });

  afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));

  it('says a file that can be read is readable, an empty one too', async () => {
    expect(await answer({ id: 1, fileName: path.join(folder, 'a.flac') })).toEqual({ id: 1, readable: true });
    expect(await answer({ id: 2, fileName: path.join(folder, 'empty.flac') })).toEqual({ id: 2, readable: true });
  });

  it('says a file that is not there, as in a mount point of a drive that is not mounted, is not readable', async () => {
    expect(await answer({ id: 3, fileName: path.join(folder, 'none.flac') })).toEqual({ id: 3, readable: false });
  });
});
