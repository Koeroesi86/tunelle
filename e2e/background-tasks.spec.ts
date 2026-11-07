import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { addFolder, expect, test } from './support/app';
import { albums, writeTrack } from './support/library';

const folderOfTracks = (count: number) => {
  const folder = mkdtempSync(join(tmpdir(), 'tunelle-tasks-'));
  [...Array(count).keys()].forEach((index) => writeTrack(folder, albums[0], index, 10));
  return folder;
};

test('lists the background work in a tooltip of the title bar while it runs, and shows nothing once it is done', async ({ start }) => {
  const { page } = await start({ env: { TUNELLE_LOUDNESS_IDLE_SECONDS: '0' } });
  await addFolder(page, folderOfTracks(2), 2);

  // the measurement of the loudness runs for a while after the scan, one track at a time
  const pill = page.locator('[aria-describedby="background-tasks"]');
  await expect(pill).toBeVisible({ timeout: 30_000 });
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
