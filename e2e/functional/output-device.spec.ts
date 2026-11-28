// Needs the real app: the audio context moving to an output of another sample rate while the track plays
import { expect, navigate, test } from '../support/app';
import { clearProbe, expectTone } from '../support/audio';
import { player } from '../support/player';
import { installSecondOutput } from '../support/second-output';

test('goes on where it was on another output at another rate, and back when that one is unplugged', async ({ session }) => {
  const { page } = session;
  await page.addInitScript(installSecondOutput);
  await page.reload();
  const controls = player(page);
  const rate = () => page.evaluate(() => window.audioProbe?.sampleRate ?? 0);
  const goesOnFrom = async (position: number) => {
    await clearProbe(page);
    await expectTone(page, 440);
    await controls.expectPlaying();
    expect(await controls.currentTime()).toBeGreaterThanOrEqual(position);
    expect(await controls.currentTime()).toBeLessThan(position + 8);
  };

  await controls.playAlbum('Pitch Perfect');
  await expectTone(page, 440);
  const defaultRate = await rate();
  await controls.seekTo(10);
  await expect.poll(() => controls.currentTime()).toBeGreaterThan(10.5);
  await navigate(page, 'Settings');

  const beforeSwitch = await controls.currentTime();
  await page.getByRole('combobox', { name: 'Output device' }).selectOption({ label: 'Second output' });

  await expect.poll(rate).toBe(96000);
  await goesOnFrom(beforeSwitch);

  const beforeUnplug = await controls.currentTime();
  await page.evaluate(() => window.unplugSecondOutput?.());

  await expect.poll(rate).toBe(defaultRate);
  await goesOnFrom(beforeUnplug);
});
