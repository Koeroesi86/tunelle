import { EventEmitter } from 'events';
import { accessSync, constants, existsSync } from 'fs';
import { dirname, join } from 'path';
import { wait } from '../shared/utils/wait';
import { getTranslator } from '../locales';
import type { Translate } from '../locales/translate';
import type { UpdateUnavailableReason } from '../types/update';

export interface SplashProgress {
  text: string;
  percent?: number;
}

export interface UpdateSource extends EventEmitter {
  autoDownload: boolean;
  checkForUpdates: () => Promise<{ isUpdateAvailable: boolean; updateInfo: { version: string } } | null>;
  downloadUpdate: () => Promise<unknown>;
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
}

interface UpdateOptions {
  // a mocked update is downloaded but never installed, the app starts as usual
  install?: boolean;
  checkTimeout?: number;
  // the download fails when no progress arrives for this long
  downloadStallTimeout?: number;
  // how long the splash waits for the app to quit after the installer was started
  installTimeout?: number;
  // the text of the splash, English by default
  translate?: Translate;
}

const defaultCheckTimeout = 10000;
const defaultDownloadStallTimeout = 60000;
const defaultInstallTimeout = 30000;

const withTimeout = <T>(promise: Promise<T>, timeout: number) => {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`The update check took longer than ${timeout} ms`)), timeout);
  });

  return Promise.race([promise, timedOut]).finally(() => clearTimeout(timer));
};

/** The version of the update, undefined when the installed version is the newest */
export const checkForUpdate = async (source: UpdateSource, timeout = defaultCheckTimeout): Promise<string | undefined> => {
  source.autoDownload = false;
  const result = await withTimeout(source.checkForUpdates(), timeout);

  return result?.isUpdateAvailable ? result.updateInfo.version : undefined;
};

/** Downloads the checked update, it fails when no progress arrives for the stall timeout; the progress listener is removed again */
export const downloadUpdate = (source: UpdateSource, onProgress: (percent: number) => void, timeout = defaultDownloadStallTimeout) => {
  let timer: NodeJS.Timeout | undefined;
  let listener: ((progress: { percent: number }) => void) | undefined;
  const stalled = new Promise<never>((_resolve, reject) => {
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => reject(new Error(`The update download made no progress for ${timeout} ms`)), timeout);
    };

    arm();
    listener = ({ percent }) => {
      arm();
      onProgress(Math.round(percent));
    };
    source.on('download-progress', listener);
  });

  return Promise.race([source.downloadUpdate(), stalled]).finally(() => {
    clearTimeout(timer);
    if (listener) source.off('download-progress', listener);
  });
};

// silent on windows, so the installer shows nothing, and the app is started again afterwards
export const installUpdate = (source: UpdateSource) => source.quitAndInstall(true, true);

// the installer quits the app, so with an update installed this only returns when something went wrong or nothing was installed:
// any failure lets the installed version start
export async function runUpdate(source: UpdateSource, report: (progress: SplashProgress) => void, options: UpdateOptions = {}): Promise<void> {
  const {
    install = true,
    checkTimeout = defaultCheckTimeout,
    downloadStallTimeout = defaultDownloadStallTimeout,
    installTimeout = defaultInstallTimeout,
    translate = getTranslator(undefined, []).t,
  } = options;

  const update = async () => {
    report({ text: translate('update.checking') });
    const version = await checkForUpdate(source, checkTimeout);

    if (!version) return;

    const downloading = translate('update.downloading', { version });
    report({ text: downloading, percent: 0 });
    await downloadUpdate(source, (percent) => report({ text: downloading, percent }), downloadStallTimeout);

    if (!install) return;

    report({ text: translate('update.restarting'), percent: 100 });
    installUpdate(source);
    await wait(installTimeout);
    console.error(`The app did not quit ${installTimeout} ms after the update was installed, starting the installed version`);
  };

  try {
    await update();
  } catch (error) {
    console.error('Update failed, starting the installed version', error);
  }
}

// stands in for electron-updater on development instances: reports a fake update and its progress
export function createMockUpdateSource(stepDelay = 250): UpdateSource {
  const source: UpdateSource = Object.assign(new EventEmitter(), {
    autoDownload: false,
    checkForUpdates: () => wait(stepDelay).then(() => ({ isUpdateAvailable: true, updateInfo: { version: '0.0.0-mock' } })),
    downloadUpdate: () =>
      Array.from({ length: 10 }, (_, step) => (step + 1) * 10).reduce<Promise<unknown>>(
        (previous, percent) => previous.then(() => wait(stepDelay)).then(() => source.emit('download-progress', { percent })),
        Promise.resolve()
      ),
    quitAndInstall: () => console.log('Mocked update, nothing to install'),
  });

  return source;
}

export interface AppImageInstall {
  /** AM (portable-linux-apps) installed it: its `AM-updater` is next to the AppImage, and `am -u` replaces the file and keeps its own record of the version */
  managedByAm: boolean;
  /** An update replaces the file, which needs the folder of the AppImage to be writable (AM installs for all users into /opt, owned by root) */
  writable: boolean;
}

const canWrite = (path: string) => {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

export const inspectAppImage = (appImage: string): AppImageInstall => ({
  managedByAm: existsSync(join(dirname(appImage), 'AM-updater')),
  writable: canWrite(dirname(appImage)),
});

/**
 * Why electron-updater can not update this install, if it can not
 * See docs/updater.md
 */
export const getUpdateUnavailableReason = (
  isPackaged: boolean,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  windowsStore?: boolean,
  appImage?: AppImageInstall
): UpdateUnavailableReason | undefined => {
  if (!isPackaged) return 'development';
  if (env.TUNELLE_NO_UPDATE === '1') return 'disabled';
  // the Store update the package itself, and its policy does not let an app update outside of it; an env variable cannot say this, the Store starts the app
  if (windowsStore) return 'store';
  if (platform !== 'linux') return undefined;
  if (env.APPIMAGE && appImage?.managedByAm) return 'am';
  if (env.APPIMAGE) return appImage?.writable === false ? 'readonly' : undefined;

  return env.FLATPAK_ID ? 'flatpak' : 'managed';
};
