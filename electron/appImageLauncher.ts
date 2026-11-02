import { execFile } from 'child_process';
import { copyFile, mkdir, readdir, readFile, readlink, rename, rm, rmdir, stat, symlink, utimes, writeFile } from 'fs/promises';
import { join, posix } from 'path';
import { catalog } from '../locales';

const launcherName = 'tunelle';
// the name of the entry that the app installed as eMusic: an update renames the app, so the entry of the old name is carried over to the new one
const legacyLauncherName = 'emusic';
const iconSizes = [16, 24, 32, 48, 64, 128, 256, 512];

export interface LauncherOptions {
  /** `$XDG_DATA_HOME`, usually `~/.local/share` */
  dataHome: string;
  /** The folder with the `<size>x<size>.png` icons of the app */
  iconsPath: string;
  /** Tells the desktop about the changed entry, `update-desktop-database` by default; it must not reject, it is best effort */
  refresh?: (applicationsPath: string) => Promise<void>;
}

const updateDesktopDatabase = (applicationsPath: string) => new Promise<void>((done) => execFile('update-desktop-database', [applicationsPath], () => done()));

const getApplicationsPath = (dataHome: string) => join(dataHome, 'applications');
const getDesktopFile = (dataHome: string, name = launcherName) => join(getApplicationsPath(dataHome), `${name}.desktop`);
// the desktop shell keeps the entry it read first and fails every start of an old path, so the entry always starts this link and the link follows the AppImage
export const getLauncherLink = (dataHome: string) => posix.join(dataHome, launcherName, 'Tunelle.AppImage');
const getIconFile = (dataHome: string, size: number, name = launcherName) => join(dataHome, 'icons/hicolor', `${size}x${size}`, 'apps', `${name}.png`);

// the characters that would need escaping in the Exec key of a desktop entry; such a path is not worth the risk of a broken launcher
const unsafePath = /["`$\\%\n]/;

// the desktop picks the comment of its own language, a locale is written lang_COUNTRY
const localizedComments = Object.entries(catalog)
  .filter(([language]) => language !== 'en')
  .map(([language, messages]) => `Comment[${language.replace('-', '_')}]=${messages['app.description']}`);

/** The content of the desktop entry that starts the AppImage; the window class is the one the app opens with */
export const buildDesktopEntry = (appImage: string) => {
  if (unsafePath.test(appImage)) throw new Error(`The AppImage path ${appImage} can not be used in a desktop entry`);

  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Tunelle',
    `Comment=${catalog.en['app.description']}`,
    ...localizedComments,
    `Exec="${appImage}" %U`,
    `Icon=${launcherName}`,
    'Terminal=false',
    'Categories=AudioVideo;Audio;Music;Player;',
    'StartupWMClass=Tunelle',
    '',
  ].join('\n');
};

/** The AppImage the installed entry starts, undefined when there is no entry */
const readExec = (dataHome: string) =>
  readFile(getDesktopFile(dataHome), 'utf8')
    .then((entry) => entry.match(/^Exec="([^"]*)"/m)?.[1])
    .catch(() => undefined);

// Windows hands a link target back with backslashes, an entry never holds one
const forwardSlashes = (path: string) => path.replaceAll('\\', '/');

export const readLauncherTarget = (dataHome: string) =>
  readExec(dataHome)
    .then((exec) => (exec === getLauncherLink(dataHome) ? readlink(exec).then(forwardSlashes, () => exec) : exec))
    .catch(() => undefined);

export const isLauncherEnabled = (dataHome: string) => readLauncherTarget(dataHome).then((target) => target !== undefined);

// the desktop reads the icons from a cache that is only dropped when the theme folder is newer than it, which a rewritten icon of the same name does not change
const invalidateIconCache = (dataHome: string) => {
  const now = new Date();

  return utimes(join(dataHome, 'icons/hicolor'), now, now).catch(() => undefined);
};

const writeIcon = (size: number, { dataHome, iconsPath }: LauncherOptions) =>
  mkdir(join(dataHome, 'icons/hicolor', `${size}x${size}`, 'apps'), { recursive: true }).then(() =>
    copyFile(join(iconsPath, `${size}x${size}.png`), getIconFile(dataHome, size))
  );

// the link is replaced through a rename, so it never is missing while the desktop starts the app
const writeLink = (appImage: string, dataHome: string) => {
  const link = getLauncherLink(dataHome);
  const temporary = `${link}.tmp`;

  // an AppImage started through the link may report the link as its own path, which must not become the target of the link
  if (appImage === link) return Promise.resolve();

  return mkdir(join(link, '..'), { recursive: true })
    .then(() => rm(temporary, { force: true }))
    .then(() => symlink(appImage, temporary, 'file'))
    .then(() => rename(temporary, link));
};

export const enableLauncher = async (appImage: string, options: LauncherOptions) => {
  const { dataHome, refresh = updateDesktopDatabase } = options;

  const entry = buildDesktopEntry(getLauncherLink(dataHome));

  await mkdir(getApplicationsPath(dataHome), { recursive: true });
  await writeLink(appImage, dataHome);
  await Promise.all(iconSizes.map((size) => writeIcon(size, options)));
  await invalidateIconCache(dataHome);
  await writeFile(getDesktopFile(dataHome), entry);
  await refresh(getApplicationsPath(dataHome));
};

export const disableLauncher = ({ dataHome, refresh = updateDesktopDatabase }: LauncherOptions) =>
  Promise.all(
    [getDesktopFile(dataHome), getLauncherLink(dataHome), ...iconSizes.map((size) => getIconFile(dataHome, size))].map((file) => rm(file, { force: true }))
  )
    .then(() => invalidateIconCache(dataHome))
    .then(() => refresh(getApplicationsPath(dataHome)));

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false
  );

const readIfThere = (path: string) => readFile(path).catch(() => undefined);

const isOtherEntry = (name: string) => name.endsWith('.desktop') && ![launcherName, legacyLauncherName].some((own) => name === `${own}.desktop`);
const startsAppImage = (appImage: string) => (entry: Buffer | undefined) =>
  (entry?.toString().split('\n') ?? []).some((line) => /^(Try)?Exec=/.test(line) && line.includes(appImage));

/** Whether a tool that integrates AppImages (Gear Lever, appimaged) already put an entry for this AppImage in the menu: a second one would show the app twice */
export const hasOtherLauncher = async (appImage: string, { dataHome }: Pick<LauncherOptions, 'dataHome'>) => {
  const applicationsPath = getApplicationsPath(dataHome);
  const names = (await readdir(applicationsPath).catch(() => [])).filter(isOtherEntry);
  const entries = await Promise.all(names.map((name) => readIfThere(join(applicationsPath, name))));

  return entries.some(startsAppImage(appImage));
};

/** Whether the installed entry and icons are what a fresh `enableLauncher` would write */
const isCurrent = async (appImage: string, { dataHome, iconsPath }: LauncherOptions) => {
  const target = await readLauncherTarget(dataHome);
  const entry = await readIfThere(getDesktopFile(dataHome));
  const icons = await Promise.all(
    iconSizes.map((size) =>
      Promise.all([readFile(join(iconsPath, `${size}x${size}.png`)), readIfThere(getIconFile(dataHome, size))]).then(
        ([bundled, installed]) => installed?.equals(bundled) === true
      )
    )
  );

  return target === appImage && entry?.toString() === buildDesktopEntry(getLauncherLink(dataHome)) && icons.every(Boolean);
};

// the desktop shell may keep the path of an entry from before the update for a whole session, so the path that the update removed leads to the link
const keepPath = (path: string, dataHome: string) =>
  rm(path, { force: true })
    .then(() => symlink(getLauncherLink(dataHome), path, 'file'))
    .catch(() => undefined);

/** What the entry of the old name of the app left: the entry, the link to the AppImage and the icons */
const getLegacyFiles = (dataHome: string) => [
  getDesktopFile(dataHome, legacyLauncherName),
  posix.join(dataHome, legacyLauncherName, 'eMusic.AppImage'),
  ...iconSizes.map((size) => getIconFile(dataHome, size, legacyLauncherName)),
];

/**
 * An update of the app from the name eMusic leaves its entry pointing to the AppImage the update removed, and the app does not know it as its own:
 * the entry of the running AppImage takes its place when there was one, and what the old name left goes away
 */
const migrateLegacyLauncher = async (appImage: string | undefined, options: LauncherOptions) => {
  const { dataHome, refresh = updateDesktopDatabase } = options;
  const [legacyEntry] = getLegacyFiles(dataHome);

  if (!appImage || !(await exists(legacyEntry))) return;
  if ((await readLauncherTarget(dataHome)) === undefined) await enableLauncher(appImage, options);

  await Promise.all(getLegacyFiles(dataHome).map((file) => rm(file, { force: true })));
  await rmdir(join(dataHome, legacyLauncherName)).catch(() => undefined);
  await invalidateIconCache(dataHome);
  await refresh(getApplicationsPath(dataHome));
};

/**
 * Keeps an enabled entry working: it points to the running AppImage when the one it started was moved,
 * and goes away when that one is gone and the app does not run from an AppImage; an entry of the running AppImage is rewritten
 * when its content or icons changed with the version, and an entry that still works for another AppImage is left alone
 */
export const syncLauncher = async (appImage: string | undefined, options: LauncherOptions) => {
  await migrateLegacyLauncher(appImage, options);

  const target = await readLauncherTarget(options.dataHome);
  if (target === undefined) return;
  if (appImage && target === appImage && !(await isCurrent(appImage, options))) return enableLauncher(appImage, options);
  if (await exists(target)) return;
  if (!appImage) return disableLauncher(options);

  const exec = await readExec(options.dataHome);
  await enableLauncher(appImage, options);
  if (exec !== getLauncherLink(options.dataHome)) await keepPath(target, options.dataHome);
};

const getOfferedFile = (folder: string) => join(folder, 'launcher-offered');

/** Whether the user was asked about the application menu entry already, in whatever way they answered */
export const wasLauncherOffered = (folder: string) => exists(getOfferedFile(folder));

export const markLauncherOffered = (folder: string) => mkdir(folder, { recursive: true }).then(() => writeFile(getOfferedFile(folder), ''));
