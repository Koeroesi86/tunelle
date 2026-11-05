import { expect, navigate, test } from './support/app';
import { player } from './support/player';

test('lists the stations of the directory with their format', async ({ start }) => {
  const { page } = await start();
  await navigate(page, 'Radio stations');

  await expect(page.getByText('Night Owl FM')).toBeVisible();
  await expect(page.getByText('Juniper Classical')).toBeVisible();
  await expect(page.getByText('FLAC', { exact: true }).first()).toBeVisible();
});

test('plays a station live, with the title its stream announces', async ({ start }) => {
  const { page } = await start();
  const controls = player(page);
  await navigate(page, 'Radio stations');

  await page.getByText('Night Owl FM').dblclick();

  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(controls.title()).toHaveText('Aurora Drift');
  await controls.expectPlaying();
  // the stream is paced in real time, so the clock moves only if it is read as it arrives
  await expect.poll(() => controls.currentTime()).toBeGreaterThan(1);

  await controls.pause();
  await controls.expectPaused();
});
