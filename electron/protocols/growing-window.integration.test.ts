import { afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-window-'));

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => path.join(root, 'out'), getPath: () => temp } }));
vi.mock('./decode-policy', async (original) => ({ ...(await original<typeof import('./decode-policy')>()), aheadBytes: () => 100_000 }));

const { growingTrack } = await import('./growing-track');

const source = path.join(root, 'e2e', 'fixtures', 'flac', '1-concert-a.flac');
const partSize = () =>
  fs
    .readdirSync(path.join(temp, 'tunelle-decoded'))
    .filter((name) => name.endsWith('.part'))
    .map((name) => fs.statSync(path.join(temp, 'tunelle-decoded', name)).size)[0];
const readAll = async (read: AsyncIterable<Buffer>) => {
  const chunks: Buffer[] = [];
  for await (const chunk of read) chunks.push(chunk);
  return Buffer.concat(chunks);
};

describe('growingTrack window with the real ffmpeg', () => {
  afterAll(() => fs.rmSync(temp, { recursive: true, force: true }));

  it('decodes a fast source only a window ahead of the read, and the rest when it is asked for', async () => {
    expect(fs.existsSync(source)).toBe(true);
    const track = await growingTrack({ path: source, codec: 'FLAC', bitDepth: null }, new AbortController().signal);
    if (!track || typeof track === 'string') throw new Error('expected a growing track');

    const first = track.read(0, 99, new AbortController().signal);
    await first.next();
    await vi.waitFor(() => expect(partSize()).toBeGreaterThan(100_000));
    expect(partSize()).toBeLessThan(track.size / 2);

    const bytes = await readAll(track.read(0, track.size - 1, new AbortController().signal));
    expect(bytes.length).toBe(track.size);
    await first.return(undefined);
  });
});
