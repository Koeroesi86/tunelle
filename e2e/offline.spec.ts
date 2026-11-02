import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { installActiveAudio } from './active-audio';
import { installAudioProbe } from './audio-probe';
import { expect, launchApp, navigate, quit, test, ui } from './app';

// the AppImage catalogues start the app on a machine without a network and reject one that exits or shows an error instead of its window
test('starts and shows its pages without a network', async () => {
  const home = mkdtempSync(join(tmpdir(), 'tunelle-e2e-offline-'));
  const { app, page } = await launchApp({
    home,
    // a name that does not resolve: the station directory is out of reach, as is the update server
    radioDirectory: 'https://radio.invalid',
    initScripts: [installActiveAudio, installAudioProbe],
    offline: true,
  });

  try {
    await expect(page.locator('#root')).not.toBeEmpty();
    // the radio page opens without its stations, and the other pages still open
    await navigate(page, 'Radio stations');
    await expect(page.getByText(ui('Radio stations'), { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('Radio stations need an internet connection. Your own library plays without one.').filter({ visible: true })).toBeVisible();
    await navigate(page, 'Albums');
    expect(page.isClosed()).toBe(false);
  } finally {
    await quit(app);
    rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
});
