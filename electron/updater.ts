import { EventEmitter } from 'events';
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

const wait = (delay: number) => new Promise<void>((resolve) => setTimeout(resolve, delay));

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

  try {
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

/**
 * electron-updater only works in the packaged app, on Linux only in an AppImage (the Flatpak updates through its store, any other package
 * through its package manager, the Microsoft Store package through the Store), and TUNELLE_NO_UPDATE=1 turns it off, which the smoke tests of the packaged app set
 */
export const getUpdateUnavailableReason = (
  isPackaged: boolean,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  windowsStore?: boolean
): UpdateUnavailableReason | undefined => {
  if (!isPackaged) return 'development';
  if (env.TUNELLE_NO_UPDATE === '1') return 'disabled';
  // the Store update the package itself, and its policy does not let an app update outside of it; an env variable cannot say this, the Store starts the app
  if (windowsStore) return 'store';
  if (platform !== 'linux' || env.APPIMAGE) return undefined;

  return env.FLATPAK_ID ? 'flatpak' : 'managed';
};
