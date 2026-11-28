// Needs the real database, files and ffmpeg: each name as the file system gives it back, as SQLite matches it and as the protocol and the decoder open it
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import type { WebContents } from 'electron';
import type { Database } from 'sqlite3';
import { unusualNames } from '../../../shared/test-unusual-names';
import { getTracksInside } from '../../repositories/library-repository';
import { createTestDatabase } from '../../test-database';
import { readWav, toneShare } from '../../test-wav';
import normalizePath from '../../utils/normalize-path';
import scanFolder from './scan-folder';

const project = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-file-names-'));

// only the electron module is replaced: where the app is and may write, the tag reader in this process, and a net.fetch that reads the file of the address
vi.mock('electron', async () => {
  const { EventEmitter } = await import('events');
  const { answer } = await import('../reading/track-reader-worker');
  class InProcessReader extends EventEmitter {
    postMessage = async (request: Parameters<typeof answer>[0]) => this.emit('message', await answer(request));
    kill = () => this.emit('exit', 0);
  }
  return {
    app: { isPackaged: false, getAppPath: () => path.join(project, 'out'), getPath: () => temp },
    utilityProcess: { fork: () => new InProcessReader() },
    protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
    net: { fetch: async (url: string) => new Response(fs.readFileSync(fileURLToPath(url))) },
  };
});

const { handleTunelleRequest } = await import('../../protocols/tunelle-protocol');

// Chromium plays AAC as it is, so its file goes out through net.fetch; FLAC goes through ffmpeg
const fixtures = {
  aac: path.join(project, 'e2e', 'fixtures', 'aac', '1-concert-a.m4a'),
  flac: path.join(project, 'e2e', 'fixtures', 'flac', '1-concert-a.flac'),
};

// the scanned folder has signs of its own, and each name a folder of its own: macOS takes both forms of an accent as one name
const root = path.join(temp, '#library 100% [a]_b');
const files = unusualNames.map(({ kind, name }, index) => ({
  kind,
  aac: path.join(root, String(index), name, `${name}.m4a`),
  flac: path.join(root, String(index), name, `${name}.flac`),
}));

describe('files with unusual names', () => {
  let database: Database;
  const sender = { send: vi.fn() } as unknown as WebContents;
  const ask = (file: string) =>
    handleTunelleRequest({
      getDatabase: () => database,
      sources: { clientOf: () => Promise.resolve(undefined) },
      appRoot: temp,
      radio: {
        resolveStream: () => Promise.reject(new Error('no radio')),
        onTitle: () => {},
        onSampleRate: () => {},
        getLogo: async () => undefined,
        getArt: () => undefined,
      },
    })(new Request(`tunelle://app/track?path=${encodeURIComponent(normalizePath(file))}`));

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    files.forEach(({ aac, flac }) => {
      fs.mkdirSync(path.dirname(aac), { recursive: true });
      fs.copyFileSync(fixtures.aac, aac);
      fs.copyFileSync(fixtures.flac, flac);
    });
    database = await createTestDatabase();
    global._database = database;
    global._appDataPath = temp;
    await scanFolder(root, sender);
  });

  afterAll(() => {
    global._database = undefined;
    fs.rmSync(temp, { recursive: true, force: true });
  });

  it('stores each path as it was written, also below a folder with signs of patterns', async () => {
    const stored = await getTracksInside(database, normalizePath(root));

    expect(stored.map((track) => track.path).sort()).toEqual(files.flatMap(({ aac, flac }) => [normalizePath(aac), normalizePath(flac)]).sort());
  });

  it.each(files)('serves the bytes of a file with $kind', async ({ aac }) => {
    const answer = await ask(aac);

    expect(answer.status).toBe(200);
    expect(Buffer.from(await answer.arrayBuffer()).equals(fs.readFileSync(fixtures.aac))).toBe(true);
  });

  it.each(files)('decodes a file with $kind', async ({ flac }) => {
    const answer = await ask(flac);
    const wav = path.join(temp, 'answer.wav');

    expect(answer.status).toBe(200);
    fs.writeFileSync(wav, Buffer.from(await answer.arrayBuffer()));
    const { samples, sampleRate } = readWav(wav);
    expect(toneShare(samples, 440, sampleRate)).toBeGreaterThan(0.9);
  });
});
