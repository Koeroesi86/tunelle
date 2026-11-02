import { expect, navigate, test } from './app';
import { clearProbe, expectSilence, expectTone, levelNow, steadyLevel } from './audio';
import { player } from './player';

// the audio is measured where it leaves the app (e2e/audio-probe.ts): the pitch says which track plays, the level says how loud, the clock says when
test('plays the album from its first track and shows the track in the player bar', async ({ session: { page } }) => {
  const controls = player(page);

  await controls.playAlbum('Pitch Perfect');

  await expectTone(page, 440);
  await expect(controls.title()).toHaveText('Concert A');
  await expect(page.getByTitle('Pause', { exact: true })).toBeVisible();
});

test('pauses into silence and resumes the same track', async ({ session: { page } }) => {
  const controls = player(page);
  await controls.playAlbum('Pitch Perfect');
  await expectTone(page, 440);

  await controls.pause();
  await expectSilence(page);
  await controls.expectPaused();

  await controls.play();
  await expectTone(page, 440);
});

test('moves between the tracks with next and previous', async ({ session: { page } }) => {
  const controls = player(page);
  await controls.playAlbum('Pitch Perfect');
  await expectTone(page, 440);

  await controls.next();
  await expectTone(page, 880);
  await expect(controls.title()).toHaveText('Octave Up');

  await controls.next();
  await expectTone(page, 100);

  await controls.previous();
  await expectTone(page, 880);
});

test('goes on to the next track when one ends, and stops after the last', async ({ session: { page } }) => {
  const controls = player(page);
  await controls.playAlbum('Pitch Perfect');
  await expectTone(page, 440);

  await controls.skipToEnd();
  await expectTone(page, 880);

  await controls.next();
  await expectTone(page, 100);
  await controls.skipToEnd();
  await expectSilence(page);
  await controls.expectPaused();
  await expect(page.getByTitle('Play', { exact: true })).toBeVisible();
});

test('starts the queue again from the first track with repeat on', async ({ session: { page } }) => {
  const controls = player(page);
  await controls.repeat();
  await controls.playAlbum('Pitch Perfect');
  await controls.next();
  await controls.next();
  await expectTone(page, 100);

  await controls.skipToEnd();

  await expectTone(page, 440);
  await expect(controls.title()).toHaveText('Concert A');
});

test('seeks inside the track and goes on playing from there', async ({ session: { page } }) => {
  const controls = player(page);
  await controls.playAlbum('Pitch Perfect');
  await expectTone(page, 440);

  await controls.seekTo(4);
  // what was heard before the seek is not what plays after it
  await clearProbe(page);

  await expect.poll(() => controls.currentTime()).toBeGreaterThan(3.9);
  await expectTone(page, 440);
});

test('follows the volume slider and the mute button', async ({ session: { page } }) => {
  const controls = player(page);
  await controls.playAlbum('Pitch Perfect');
  await controls.setVolume(1);
  await expectTone(page, 440);
  // what was heard before the volume was at the full is not its level
  await clearProbe(page);
  const full = await levelNow(page);

  await controls.setVolume(0.5);
  await expect.poll(async () => (await levelNow(page)) / full).toBeCloseTo(0.5, 1);

  await controls.mute();
  await expectSilence(page);

  await controls.unmute();
  await expectTone(page, 440);
});

test('changes the level of a bass tone with the equalizer presets', async ({ session: { page } }) => {
  const controls = player(page);
  await controls.playAlbum('Pitch Perfect');
  await controls.setVolume(1);
  await controls.next();
  await controls.next();
  await expectTone(page, 100);
  const flat = await steadyLevel(page);

  await navigate(page, 'Equalizer');
  await page.getByRole('button', { name: 'Bass boost' }).click();
  await expect.poll(async () => (await levelNow(page)) / flat).toBeGreaterThan(1.3);

  await page.getByRole('button', { name: 'Treble boost' }).click();
  await expect.poll(async () => (await levelNow(page)) / flat).toBeLessThan(0.95);

  await page.getByRole('button', { name: 'Flat' }).click();
  await expect.poll(async () => (await levelNow(page)) / flat).toBeCloseTo(1, 1);
});

test('plays the track that was moved up with the keyboard, and stops with the queue when it is cleared', async ({ session: { page } }) => {
  const controls = player(page);
  await controls.playAlbum('Pitch Perfect');
  await expectTone(page, 440);
  await navigate(page, 'Now playing');

  await page.getByTitle('#3 Deep Bass').filter({ visible: true }).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await controls.next();
  await expectTone(page, 100);

  await page.getByRole('button', { name: 'Clear', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Clear the queue?' }).click();

  await expectSilence(page);
  await expect(page.getByText('Nothing is playing').filter({ visible: true })).toBeVisible();
});
