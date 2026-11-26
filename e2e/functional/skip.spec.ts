import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { addFolder, expect, test as base } from '../support/app';
import { expectTone } from '../support/audio';
import { player } from '../support/player';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', 'mp3', name));

/** An album of five long tracks of 440 Hz and a short last one of 880 Hz; named before `start`, so it is removed after the app has quit */
const test = base.extend<{ longAlbum: string }>({
  longAlbum: async ({}, use) => {
    const folder = mkdtempSync(join(tmpdir(), 'tunelle-e2e-long-'));
    // the MP3 frames repeated: a track that ffmpeg takes about a second or more to decode as a whole, longer than the skips take
    const long = Buffer.concat(Array.from({ length: 600 }, () => fixture('1-concert-a.mp3')));
    Array.from({ length: 5 }, (_, index) => writeFileSync(join(folder, `1-long-${index}.mp3`), long));
    writeFileSync(join(folder, '2-octave-up.mp3'), fixture('2-octave-up.mp3'));
    await use(folder);
    rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  },
});

// That the page letting a request go reaches the main process is a thing of Chromium and Electron, which a signal made by a test does not show (docs/app/tunelle-protocol.md)
test('stops the decodes of the tracks that were skipped, and starts the current one', async ({ longAlbum, start }) => {
  // the measurement of the loudness decodes tracks too, so it waits until after the test
  const { app, page } = await start({ env: { TUNELLE_LOUDNESS_IDLE_SECONDS: '3600' } });
  await addFolder(page, longAlbum, 6);
  const cache = join(await app.evaluate(({ app }) => app.getPath('temp')), `tunelle-${process.getuid?.() ?? 'user'}`, 'whole-decodes');
  // the folder is shared with the other runs of the machine, and is not there before the first whole decode
  const listing = () => {
    try {
      return readdirSync(cache);
    } catch {
      return [];
    }
  };
  const before = new Set(listing());
  const controls = player(page);

  await controls.playAlbum('Encoder Delay');
  for (const _ of Array.from({ length: 5 })) await controls.next();
  await expectTone(page, 880);

  // a skipped decode that went on would add its copy, or leave its part file while it runs
  await expect.poll(() => listing().filter((name) => !before.has(name))).toEqual([expect.stringMatching(/\.wav$/)]);
});
