import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { addFolder, expect, test } from '../support/app';
import { clearProbe, expectTone, expectToneOnRight } from '../support/audio';
import { player } from '../support/player';

const rate = 44100;
const seconds = 20;

const chunk = (id: string, body: Buffer) => {
  const header = Buffer.alloc(8);
  header.write(id, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body, Buffer.alloc(body.length % 2)]);
};

const text = (id: string, value: string) => chunk(id, Buffer.from(`${value}\0`));

/** A 16 bit WAV of an album, with the same sine on each of its channels */
const toneWav = (channels: number, frequency: number, track: number) => {
  const format = Buffer.alloc(16);
  format.writeUInt16LE(1, 0);
  format.writeUInt16LE(channels, 2);
  format.writeUInt32LE(rate, 4);
  format.writeUInt32LE(rate * channels * 2, 8);
  format.writeUInt16LE(channels * 2, 12);
  format.writeUInt16LE(16, 14);
  const audio = Buffer.alloc(seconds * rate * channels * 2);
  Array.from({ length: seconds * rate * channels }, (_, index) =>
    Math.round(16000 * Math.sin((2 * Math.PI * frequency * Math.floor(index / channels)) / rate))
  ).forEach((sample, index) => audio.writeInt16LE(sample, index * 2));
  const tags = [text('INAM', `Track ${track}`), text('IPRD', 'Channel Count'), text('IART', 'Tunelle'), text('ITRK', `${track}`)];
  const info = chunk('LIST', Buffer.concat([Buffer.from('INFO'), ...tags]));
  return chunk('RIFF', Buffer.concat([Buffer.from('WAVE'), chunk('fmt ', format), info, chunk('data', audio)]));
};

// the next track waits in the second element: one of 3 channels there put a mono track on the left only (docs/app/audio-context.md)
test('plays a mono track on both sides beside a track of three channels', async ({ start }, testInfo) => {
  const { page } = await start();
  const folder = testInfo.outputPath('music');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, '1-mono.wav'), toneWav(1, 440, 1));
  writeFileSync(join(folder, '2-surround.wav'), toneWav(3, 880, 2));
  await addFolder(page, folder, 2);
  const controls = player(page);

  await controls.playAlbum('Channel Count');
  await expect(controls.title()).toHaveText('Track 1');
  // the next track is loaded by then
  await expect.poll(() => controls.currentTime()).toBeGreaterThan(3);
  await clearProbe(page);
  await expectTone(page, 440);
  await expectToneOnRight(page, 440);

  // and it stays so after the hand over to that track and back
  await controls.next();
  await expectToneOnRight(page, 880);
  await controls.previous();
  await controls.previous();
  await expect(controls.title()).toHaveText('Track 1');
  await clearProbe(page);
  await expectToneOnRight(page, 440);
});
