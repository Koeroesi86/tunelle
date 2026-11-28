// Needs the real app: how the net.fetch of Electron opens the file: address of a name with these signs, which every lower tier replaces
import { copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { addFolder, expect, test } from '../support/app';
import { expectTone } from '../support/audio';
import { player } from '../support/player';

// one name with the signs that an address can misread, each of them valid on every system; the other names are rows of the lower tiers
const name = "#1 100% %23 Caf\u00e9 e\u0301 \ud83c\udfb5 [a] (b) & = ';!";

// AAC is played by Chromium as it is, so the file itself is what the app loads
test('plays a file with the signs of an address in its name and in the name of its folder', async ({ start }, testInfo) => {
  const folder = testInfo.outputPath(name);
  mkdirSync(folder, { recursive: true });
  copyFileSync(join(__dirname, '..', 'fixtures', 'aac', '1-concert-a.m4a'), join(folder, `${name}.m4a`));
  const { page } = await start();
  await addFolder(page, folder, 1);
  const controls = player(page);

  await controls.playAlbum('Priming');

  await expectTone(page, 440);
  await expect(controls.title()).toHaveText('Concert A');
});
