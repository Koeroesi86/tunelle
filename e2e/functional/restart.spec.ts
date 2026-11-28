// Needs the real app: a real quit, and the media element taking the position again (the kept settings: client/redux/persisted-settings.test.ts)
import { expect, navigate, quit, test } from '../support/app';
import { expectSilence, expectTone } from '../support/audio';
import { player } from '../support/player';

test('brings back the queue, the track and the position after a restart, paused', async ({ session, start }) => {
  const before = player(session.page);
  await before.playAlbum('Pitch Perfect');
  await expectTone(session.page, 440);
  await before.next();
  await expectTone(session.page, 880);
  await before.seekTo(12);
  await expect.poll(() => before.currentTime()).toBeGreaterThan(12.5);
  await quit(session.app);

  const { page } = await start();
  const controls = player(page);

  await expect(controls.title()).toHaveText('Octave Up');
  await expect(page.getByTitle('Play', { exact: true })).toBeVisible();
  await controls.expectPaused();
  await expectSilence(page);
  await expect.poll(() => controls.currentTime()).toBeGreaterThan(12.5);
  expect(await controls.currentTime()).toBeLessThan(25);
  await navigate(page, 'Now playing');
  await expect(page.getByTitle('#3 Deep Bass').filter({ visible: true })).toBeVisible();

  await controls.play();
  await expectTone(page, 880);
  expect(await controls.currentTime()).toBeGreaterThan(12.5);
  await controls.next();
  await expectTone(page, 100);
});
