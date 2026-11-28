// Needs the real app: a filter of Web Audio keeps a sample that is no number
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { addFolder, expect, navigate, test } from '../support/app';
import { clearProbe, expectToneOnRight } from '../support/audio';
import { player } from '../support/player';

const rate = 44100;
const seconds = 20;
/** The frame whose right sample is no number */
const damaged = 2 * rate;

/** A stereo WAV of 32 bit float with a 440 Hz sine on both channels */
const damagedWav = () => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + seconds * rate * 8, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 8, 28);
  header.writeUInt16LE(8, 32);
  header.writeUInt16LE(32, 34);
  header.write('data', 36);
  header.writeUInt32LE(seconds * rate * 8, 40);
  const audio = Buffer.alloc(seconds * rate * 8);
  Array.from({ length: seconds * rate }, (_, frame) => 0.5 * Math.sin((2 * Math.PI * 440 * frame) / rate)).forEach((sample, frame) => {
    audio.writeFloatLE(sample, frame * 8);
    audio.writeFloatLE(frame === damaged ? NaN : sample, frame * 8 + 4);
  });
  return Buffer.concat([header, audio]);
};

// a filter of the equalizer keeps a sample that is no number for good, which silenced the right channel until a restart (docs/app/audio-context.md)
test('goes on playing both channels after a sample that is no number', async ({ start }, testInfo) => {
  const { page } = await start();
  const folder = testInfo.outputPath('music');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'damaged.wav'), damagedWav());
  await addFolder(page, folder, 1);
  await navigate(page, 'Songs');

  // the file has no tags and is the only track, so its row is the only one with the button
  await page.getByRole('button', { name: 'Play next' }).click();
  await player(page).next();
  await player(page).play();
  await expect.poll(() => player(page).currentTime()).toBeGreaterThan(damaged / rate + 1);
  await clearProbe(page);

  await expectToneOnRight(page, 440);
});
