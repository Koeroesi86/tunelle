import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { answerProbe } from './mount-probe-worker';

describe('the worker that checks a drive', () => {
  let folder: string;

  beforeAll(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-probe-'));
    fs.writeFileSync(path.join(folder, 'a.flac'), 'data');
    fs.writeFileSync(path.join(folder, 'empty.flac'), '');
  });

  afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));

  it('says a file that can be read is readable, an empty one too', async () => {
    expect(await answerProbe({ id: 1, kind: 'file', path: path.join(folder, 'a.flac') })).toEqual({ id: 1, readable: true });
    expect(await answerProbe({ id: 2, kind: 'file', path: path.join(folder, 'empty.flac') })).toEqual({ id: 2, readable: true });
  });

  it('says a file that is not there, as in a mount point of a drive that is not mounted, is not readable', async () => {
    expect(await answerProbe({ id: 3, kind: 'file', path: path.join(folder, 'none.flac') })).toEqual({ id: 3, readable: false, code: 'ENOENT' });
  });

  it('tells a folder with entries from an empty one, and one that is gone', async () => {
    const empty = path.join(folder, 'empty');
    fs.mkdirSync(empty);

    expect(await answerProbe({ id: 4, kind: 'entries', path: folder })).toEqual({ id: 4, readable: true, empty: false });
    expect(await answerProbe({ id: 5, kind: 'entries', path: empty })).toEqual({ id: 5, readable: true, empty: true });
    expect(await answerProbe({ id: 6, kind: 'entries', path: path.join(folder, 'none') })).toEqual({ id: 6, readable: false, code: 'ENOENT' });
  });

  it('gives the time of a folder, and the names in it with the ones that are folders', async () => {
    const reply = await answerProbe({ id: 7, kind: 'listing', path: folder });
    const { time } = await answerProbe({ id: 8, kind: 'stat', path: folder });

    expect(reply).toMatchObject({ readable: true, time, directories: ['empty'] });
    expect(reply.names?.toSorted()).toEqual(['a.flac', 'empty', 'empty.flac']);
    expect(time).toBe(Math.floor(fs.statSync(folder).mtimeMs));
  });
});
