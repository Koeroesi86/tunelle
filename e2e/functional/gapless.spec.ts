import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { longestSilence, overlapOf } from '../../scripts/tooling/audio-joins';
import { addFolder, expect, test } from '../support/app';
import { writeTrack } from '../support/library';
import { expectTone } from '../support/audio';
import { player } from '../support/player';

// a loaded runner can starve the audio thread for a moment in the middle of a track, which a missing gapless playback does at every change of track, so only this file retries. See docs/development/ci-runners.md
test.describe.configure({ retries: process.env.CI ? 2 : 0 });

const album = { title: 'Three in a Row', artist: 'The Sine Waves', genre: 'Electronic', year: 2020 };
const tracks = [440, 880, 1320].map((frequency) => ({ title: `Tone ${frequency}`, frequency }));

// tracks of 6 s, so the end of each is reached by playing, not by a seek: a seek leaves a gap of its own in some formats and on some systems
const flacFolder = () => {
  const folder = mkdtempSync(join(tmpdir(), 'tunelle-gapless-'));
  tracks.forEach((_, index) => writeTrack(folder, { ...album, tracks }, index, 6));
  return folder;
};

const formats = [
  { format: 'FLAC', folder: flacFolder, title: album.title, frequencies: tracks.map(({ frequency }) => frequency) },
  { format: 'AAC', folder: () => join(__dirname, '..', 'fixtures', 'aac'), title: 'Priming', frequencies: [440, 880] },
];

// seconds. A silence of a millisecond or less is not heard as a gap
const noGap = 0.001;
// the next track starts a lead before the end of the playing one: 100 ms at the first change, then what the last starts took. See docs/development/gapless-measurement.md
const firstOverlap = 0.12;
const laterOverlap = 0.06;

// the encoder of these formats adds silence at the start and the end of a file (the delay and the padding): Chromium leaves it out, which is why the player does not trim it itself
for (const { format, folder, title, frequencies } of formats) {
  test(`plays the ${format} tracks of an album one after the other without a gap`, async ({ start }) => {
    const { page } = await start({ bypassCSP: true });
    await addFolder(page, folder(), frequencies.length);
    await player(page).playAlbum(title);
    await expectTone(page, frequencies[0]);

    // the tracks play to their ends
    await page.evaluate(() => window.startRecording?.());
    for (const frequency of frequencies.slice(1)) await expectTone(page, frequency);

    const samples = (await page.evaluate(() => window.recordedSamples?.())) ?? [];
    const sampleRate = (await page.evaluate(() => window.audioProbe?.sampleRate)) ?? 0;
    const overlaps = frequencies.slice(1).map((frequency, index) => overlapOf(samples, sampleRate, [frequencies[index], frequency]));
    const silence = longestSilence(samples, sampleRate);
    console.log(`${format}: longest silence ${(silence * 1000).toFixed(2)} ms, overlaps ${overlaps.map((s) => (s * 1000).toFixed(1)).join(', ')} ms`);

    expect(silence, 'longest silence in seconds').toBeLessThanOrEqual(noGap);
    overlaps.forEach((overlap, index) => expect(overlap, `overlap of change ${index + 1} in seconds`).toBeLessThanOrEqual(index ? laterOverlap : firstOverlap));
  });
}
