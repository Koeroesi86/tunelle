import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { addFolder, expect, test } from './support/app';
import { albums, writeTrack } from './support/library';

const folderOfTracks = (count: number, seconds: number) => {
  const folder = mkdtempSync(join(tmpdir(), 'tunelle-tasks-'));
  [...Array(count).keys()].forEach((index) => writeTrack(folder, albums[0], index, seconds));
  return folder;
};

test('lists the background work in a tooltip of the title bar while it runs, and shows nothing once it is done', async ({ start }) => {
  // it waits for the measurement of a 180 s track to end (about 70 s on the Intel runner), and the waits below add up to more than the 180 s of a test
  test.setTimeout(300_000);
  const { page } = await start({ env: { TUNELLE_LOUDNESS_IDLE_SECONDS: '0' } });
  // the loudness is listed once its first track starts, so the track is long enough to still run when the list is read, on any runner
  await addFolder(page, folderOfTracks(1, 180), 1);

  const pill = page.locator('[aria-describedby="background-tasks"]');
  await expect(pill).toBeVisible({ timeout: 60_000 });
  await pill.hover();
  await expect(page.getByRole('tooltip').getByText('Background tasks')).toBeVisible();
  await expect(
    page
      .getByRole('tooltip')
      .getByText(/Scanning the library|Loudness normalization|Album art colours/)
      .first()
  ).toBeVisible();

  await expect(pill).toBeHidden({ timeout: 120_000 });
});
