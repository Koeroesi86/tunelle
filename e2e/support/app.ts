import { _electron as electron, test as base, expect, type ElectronApplication, type Page } from '@playwright/test';
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { startDirectory } from '../../scripts/screenshots/screenshot-fixtures';
import { installActiveAudio } from './active-audio';
import { installAudioProbe } from './audio-probe';
import { albums, writeLibrary } from './library';
import { installNoNotifications } from './no-notifications';
import { readStartTimes, type StartTimes } from './start-times';

export interface Session {
  app: ElectronApplication;
  page: Page;
  /** When the first load of the page painted, from the spawn of the app: only with `measureStart` */
  startTimes?: StartTimes;
}

interface Directory {
  origin: string;
  close: () => void;
}

interface Fixtures {
  /** A folder of the generated albums, outside of the profile of the app */
  music: string;
  /** Starts the app on the profile of the test: a second start finds what the first one left; `measureStart` reads the paint times of the first load, before the page is reloaded for the init scripts */
  start: (options?: { measureStart?: boolean }) => Promise<Session>;
  /** The app started on a profile whose library holds the albums of `music` */
  session: Session;
  /** The fake station directory the app is pointed to; the first station plays silence and announces a song */
  directory: Directory;
}

const tracksInLibrary = albums.flatMap((album) => album.tracks).length;

const root = resolve(__dirname, '../..');

/** Closes the app, and kills it (with its processes) when it has not closed in thirty seconds: the profile is thrown away anyway, and a quit that hangs would take the whole run with it */
export const quit = async (app: ElectronApplication) => {
  // the handle is gone once the app has closed, which a test that restarts the app has done before the end
  const child = (() => {
    try {
      return app.process();
    } catch {
      return undefined;
    }
  })();
  if (!child) return;

  let timer: NodeJS.Timeout | undefined;
  const closed = await Promise.race([
    app.close().then(() => true),
    new Promise<boolean>((done) => {
      timer = setTimeout(() => done(false), 30_000);
    }),
  ])
    // a close that failed leaves the process alive: it is killed below
    .catch(() => false)
    .finally(() => clearTimeout(timer));
  if (closed || !child.pid) return;

  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', `${child.pid}`, '/T', '/F']);
  else child.kill('SIGKILL');
};

const pageUrl = 'tunelle://app/index.html';

// the splash window opens first, then the page: the one that has loaded the page is the one the tests use
const findPage = async (app: ElectronApplication) => {
  await expect.poll(() => app.windows().some((window) => window.url() === pageUrl), { message: 'the window of the app', timeout: 60_000 }).toBe(true);
  const page = app.windows().find((window) => window.url() === pageUrl);
  if (!page) throw new Error('The window of the app closed');
  await page.waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0);
  return page;
};

export const test = base.extend<Fixtures>({
  music: async ({}, use) => {
    const folder = mkdtempSync(join(tmpdir(), 'tunelle-e2e-music-'));
    writeLibrary(folder);
    await use(folder);
    rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  },

  directory: async ({}, use) => {
    const directory: Directory = await startDirectory();
    await use(directory);
    directory.close();
  },

  session: async ({ start, music }, use) => {
    const session = await start();
    await addFolder(session.page, music, tracksInLibrary);
    await use(session);
  },

  start: async ({ directory }, use) => {
    // a clean profile, so the run does not touch the library of the machine
    const home = mkdtempSync(join(tmpdir(), 'tunelle-e2e-'));
    const running: ElectronApplication[] = [];

    await use(async ({ measureStart } = {}) => {
      const session = await launchApp({ home, radioDirectory: directory.origin, initScripts: [installActiveAudio, installAudioProbe], measureStart });
      running.push(session.app);
      return session;
    });

    await Promise.all(running.map(quit));
    // a process that was just killed may hold its files for a moment, and a left over temporary folder is no failure
    try {
      rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch (error) {
      console.warn('profile not removed', error);
    }
  },
});

interface LaunchOptions {
  /** The profile of the app: its user data, and where the system looks for the profile of the user */
  home: string;
  /** The station directory the app is pointed to */
  radioDirectory: string;
  /** Added to the page before its own code runs, so the first audio context of the app is seen by them */
  /** The first one installs window.activeAudio, which says whether they ran */
  initScripts: (() => void)[];
  /** Every name but localhost fails to resolve, as on a machine without a network: the station directory and the update server are out of reach */
  offline?: boolean;
  /** Reads the paint times of the first load of the page into `startTimes` (it costs about a tenth of a second) */
  measureStart?: boolean;
}

/** The language of the app in the run: English, or another file of shared/locales/ with SCREENSHOTS_LANG=hu (the pictures of the Store listing) */
const language = process.env.SCREENSHOTS_LANG ?? 'en';
const locale = language === 'en' ? 'en_US' : `${language}_${language.toUpperCase()}`;

const messages = (tag: string): Record<string, string> => JSON.parse(readFileSync(join(root, 'shared', 'locales', `${tag}.json`), 'utf8'));

/** The text of the app in the language of the run, from its English text: a text with a number ("20 tracks") is found by its {count} message */
export const ui = (english: string) => {
  const source = messages('en');
  const target = messages(language);
  const key = Object.keys(source).find((candidate) => source[candidate] === english);
  if (key) return target[key] ?? english;
  const counted = Object.keys(source).find((candidate) =>
    new RegExp(`^${source[candidate].replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace('{count}', '(\\d+)')}$`).test(english)
  );
  if (!counted) return english;
  return target[counted]?.replace('{count}', english.match(/\d+/)?.[0] ?? '') ?? english;
};

/** Starts the built app (npm run build first, PERF_APP_OUT=<folder> for the build of another checkout, which the perf runs compare with) on a profile, and answers when its window shows the page */
export const launchApp = async ({ home, radioDirectory, initScripts, offline = false, measureStart = false }: LaunchOptions): Promise<Session> => {
  const { ELECTRON_RUN_AS_NODE, ...inherited } = process.env;
  // Windows keeps its profile folders (chromium needs them, and the app data folder does not follow the variables there)
  const profile: Record<string, string> =
    process.platform === 'win32' ? {} : { HOME: home, XDG_CONFIG_HOME: home, LANG: `${locale}.UTF-8`, LC_ALL: `${locale}.UTF-8` };

  const spawnedAt = Date.now();
  const app = await electron.launch({
    args: [
      join(process.env.PERF_APP_OUT ?? join(root, 'out'), 'index.js'),
      // the audio runs with its clock and its graph, to a sink that plays nothing: the tests measure what the app sends to it
      '--disable-audio-output',
      '--autoplay-policy=no-user-gesture-required',
      `--lang=${language}`,
      `--user-data-dir=${join(home, 'user-data')}`,
      ...(offline ? ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] : []),
      // Linux draws without a display server: a window on a desktop session gets no frames while the compositor does not ask for them (a locked screen, another workspace)
      // the chromium sandbox needs user namespaces that the runners of CI (containers, locked down images) do not give; macOS and Windows run it
      ...(process.platform === 'linux' ? ['--no-sandbox', '--ozone-platform=headless'] : []),
    ],
    env: {
      ...Object.fromEntries(Object.entries(inherited).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      ...profile,
      NODE_ENV: 'production',
      ...(offline ? {} : { TUNELLE_NO_UPDATE: '1' }),
      TUNELLE_NO_ARTIST_PHOTOS: '1',
      // the library is in the profile of the run on every system, not in the app data folder of the user (macOS and Windows do not follow HOME there)
      TUNELLE_APP_DATA: home,
      TUNELLE_RADIO_DIRECTORY: radioDirectory,
    },
  });
  await Promise.all([installNoNotifications, ...initScripts].map((script) => app.context().addInitScript(script)));
  const page = await findPage(app);
  // before the reload below, which starts the page again
  const startTimes = measureStart ? await readStartTimes(page, spawnedAt) : undefined;
  // a window of the same size on every system, or the layout of a small display moves the controls out of reach
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => window.setContentSize(1360, 850)));
  // the init scripts run on the next load; the first one may have been before them
  if (!(await page.evaluate(() => Boolean(window.activeAudio)))) await page.reload();
  await page.waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0);
  // the tests measure the page through them: without them a check would pass on defaults
  const installed = await page.evaluate(() => Boolean(window.activeAudio) && Boolean(window.audioProbe));
  if (!installed) throw new Error('The init scripts (window.activeAudio, window.audioProbe) did not run on the page, even after a reload');
  return { app, page, startTimes };
};

export { expect };

/** Adds a folder to the library the way the folder dialog does, and waits for the scan to have its tracks */
export const addFolder = async (page: Page, folder: string, tracks: number, timeout?: number) => {
  await page.evaluate((path) => window.electronAPI.send('ADD_FOLDERS_TO_LIBRARY', [{ path, lastModified: 0 }]), folder);
  await expect.poll(() => libraryTracks(page), { message: `${tracks} tracks in the library`, timeout }).toHaveLength(tracks);
};

export const libraryTracks = (page: Page): Promise<{ path: string; title?: string }[]> =>
  page.evaluate(() => fetch('tunelle://app/library').then((response) => response.json()));

/** Opens a page from the navigation (the same words are headings of the pages themselves) */
export const navigate = (page: Page, label: string) => page.locator('[class*="Navigation__label"]').getByText(ui(label), { exact: true }).click();
