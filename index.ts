import { app, dialog } from 'electron';
import type { BrowserWindow } from 'electron';
import { join, resolve } from 'path';
import fs from 'fs';
import minimist from 'minimist';
import ws from 'windows-shortcuts-appid';
import type { AppWindows } from '@shared/types/global';
import { directoryUrlSchema } from './electron/schemas/environment';
import getAppDataPath from './electron/utils/app-data-path';
import { readUpdatePreference, saveUpdatePreference } from './electron/services/update-preference';
import { isMeteredConnection } from './electron/services/metered-connection';
import { askOnSplash } from './electron/services/splash-confirm';
import { copyOldLibrary, copyOldUserData, getAppName } from './electron/utils/user-data';
import createWindow from './electron/windows/create-window';
import { createStartupSignal } from './electron/services/startup-signal';
import loadPage from './electron/windows/load-page';
import createDatabase from './electron/database/create-database';
import { libraryErrorMessage } from './electron/utils/library-error-message';
import setupListeners from './electron/listeners/setup-listeners';
import { tunelleOrigin, handleTunelleProtocol, registerTunelleScheme } from './electron/protocols/tunelle-protocol';
import { createRadioBrowser } from './electron/services/radio-browser';
import { createRadioArt } from './electron/services/radio-art';
import { createRadioLogos } from './electron/services/radio-logos';
import { getAppUserModelId, setsAppUserModelId } from './electron/app-user-model-id';
import { holdSingleInstance } from './electron/windows/single-instance';
import { registerDevDesktopEntry, removeDevDesktopEntry } from './electron/services/dev-desktop-entry';
import closeDatabase from './electron/database/close-database';
import { sendIfAlive } from './electron/utils/send-if-alive';
import { cancelScans } from './electron/library/scan/scan-cancellation';
import { backgroundQueue } from './electron/library/tasks/background-queue';
import { registerLoudness } from './electron/library/loudness/loudness-source';
import { getMainTranslator, setPickedLanguage } from './electron/language';
import { applyThemeMode } from './electron/theme';
import { applyPowerSetting, startPowerState } from './electron/power/power-state';
import { getSettings } from './electron/repositories/settings-repository';
import { autoUpdater } from 'electron-updater';
import { createMockUpdateSource, getUpdateUnavailableReason, inspectAppImage, inspectMacInstall, runUpdate } from './electron/services/updater';
import { bundleOf, confirmStart, createMacUpdateSource } from './electron/services/mac-update-source';
import { createUpdateManager } from './electron/services/update-manager';
import type { UpdateSource } from './electron/services/updater';

// compiled to out/index.js, the project root is one level up
const rootPath = resolve(__dirname, '..');
const packageInfo: { name: string; description: string } = JSON.parse(fs.readFileSync(resolve(rootPath, 'package.json'), 'utf8'));

process.env.ELECTRON_ENABLE_LOGGING = '1';

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isDev = process.env.NODE_ENV === 'development';

// a second start of the same profile brings the running window forward and leaves: two apps would open the library and play at once
// the lock follows the user data folder, so a run with a folder of its own (a test, --user-data-dir) does not meet another one
// app.exit does not stop the start up that follows, which would meet the lock of the first start and fail
holdSingleInstance(
  app,
  () => windows.main,
  (code) => process.exit(code)
);

// the development window gets its icon on linux from this desktop entry, which only exists while it runs
if (isDev && process.platform === 'linux') {
  const dataHome = process.env.XDG_DATA_HOME || join(app.getPath('home'), '.local/share');

  app.setDesktopName('tunelle-dev.desktop');
  registerDevDesktopEntry(dataHome, resolve(__dirname, '../icons/png/512x512.png'));
  app.on('will-quit', () => removeDevDesktopEntry(dataHome));
}

// the entry the AppImage launcher installs (electron/services/app-image-launcher.ts), or the one the Flatpak installs under its id, so the running window gets its icon in the dock and taskbar
if (!isDev && process.platform === 'linux') {
  app.setDesktopName(`${process.env.FLATPAK_ID ?? 'tunelle'}.desktop`);
}

// the app has its own MPRIS service (electron/listeners/register-mpris-listeners.ts), so the one of Chromium would be a second player in the media controls
if (process.platform === 'linux') app.commandLine.appendSwitch('disable-features', 'MediaSessionService');

const isMockUpdate = !app.isPackaged && process.env.MOCK_UPDATE === '1';

const argv = minimist(process.argv.slice(2));

// the name shows in the OS (the media controls name the app by it) and Electron's own data folder follows it, so the data of the folders of the old names
// (eMusic, and electron-music-player before it) is copied once, before anything reads the new folder (Electron creates it then). The library folder follows
// the package name and is copied after it. A run with a folder of its own (--user-data-dir, a test) is left alone
const appName = getAppName(isDev);

if (!isDev && !process.env.TUNELLE_APP_DATA && !app.commandLine.hasSwitch('user-data-dir')) {
  const appData = app.getPath('appData');

  ['eMusic', 'electron-music-player'].some((oldName) => copyOldUserData(join(appData, oldName), join(appData, appName)));
  copyOldLibrary(join(appData, 'electron-music-player'), join(appData, packageInfo.name));
}

app.setName(appName);

global._appDataPath = getAppDataPath(app.getPath('appData'), packageInfo.name, isDev, process.env.TUNELLE_APP_DATA);
const appDataPath = global._appDataPath;

const windows: AppWindows = {
  main: null,
};

// the page is served by the tunelle protocol; a development run loads it from the dev server, which asks the protocol across origins
const devOrigin = argv.webpackPort ? `http://localhost:${argv.webpackPort}` : undefined;
const pageOrigin = devOrigin ?? tunelleOrigin;
const windowLocation = `${pageOrigin}/index.html`;
const loudnessLocation = `${pageOrigin}/loudness.html`;

// before the app is ready
registerTunelleScheme();

function setAppId() {
  global._appId = getAppUserModelId(isDev, process.env.NODE_ENV);

  if (setsAppUserModelId(process.platform, process.windowsStore)) {
    app.setAppUserModelId(global._appId);
    console.log('Registered app ID', global._appId);
  }

  if (isWin && isDev) {
    const shortcutPath = `${app.getPath('appData')}\\Microsoft\\Windows\\Start Menu\\Programs\\Tunelle${isDev ? '-' + process.env.NODE_ENV : ''}.lnk`;

    fs.rmSync(shortcutPath, { force: true });

    ws.create(
      shortcutPath,
      {
        target: process.execPath,
        desc: packageInfo.description,
        workingDir: rootPath,
        icon: resolve(rootPath, './icons/win/icon.ico'),
      },
      (err) => {
        if (err) throw err;

        ws.addAppId(shortcutPath, global._appId, (err) => {
          if (err) throw err;
        });
      }
    );
  }
}

// the window opens at once with the splash that is in its page, the player is mounted under it when the app has started. See docs/app/startup.md
const openWindow = () => {
  setAppId();
  const main = createWindow();
  windows.main = main;

  main.once('ready-to-show', () => {
    main.show();
    if (isWin) main.setBackgroundMaterial('acrylic');
  });
  main.on('closed', () => {
    windows.main = null;
  });

  return main;
};

if (!fs.existsSync(appDataPath)) {
  fs.mkdirSync(appDataPath);
}

const libraryLocation = resolve(appDataPath, './library.sqlite');

// a test run asks a directory of its own, the real one needs the network
const radio = createRadioBrowser(`Tunelle/${app.getVersion()}`, directoryUrlSchema.parse(process.env.TUNELLE_RADIO_DIRECTORY), {
  cachePath: resolve(appDataPath, './radio-mirrors.json'),
  streamsPath: resolve(appDataPath, './radio-streams.json'),
});

const radioArt = createRadioArt(`Tunelle/${app.getVersion()} ( https://github.com/Koeroesi86/tunelle )`);

const radioLogos = createRadioLogos(radio.getLogoUrl);

const serveApp = () =>
  handleTunelleProtocol({
    getDatabase: () => global._database,
    appRoot: resolve(rootPath, 'build'),
    devOrigin,
    radio: {
      resolveStream: radio.resolveStream,
      getArt: radioArt.get,
      getLogo: radioLogos.get,
      onSampleRate: (uuid, sampleRate) => windows.main?.webContents.send('RADIO_STREAM_RATE', { uuid, sampleRate }),
      onTitle: (uuid, title, streamUrl) => {
        windows.main?.webContents.send('RADIO_STREAM_TITLE', { uuid, title });
        radioArt
          .lookup(title, streamUrl)
          .then((art) => windows.main?.webContents.send('RADIO_STREAM_ART', { uuid, title, art }))
          .catch((error) => console.error(error));
      },
    },
  });

// a development run updates from the mock source only when asked to
const unavailable = isMockUpdate
  ? undefined
  : getUpdateUnavailableReason(
      app.isPackaged,
      process.platform,
      process.env,
      process.windowsStore,
      process.env.APPIMAGE ? inspectAppImage(process.env.APPIMAGE) : undefined,
      process.platform === 'darwin' ? inspectMacInstall(bundleOf(process.execPath)) : undefined
    );

const getUpdateSource = (): UpdateSource | undefined => {
  if (isMockUpdate) return createMockUpdateSource();

  if (unavailable) return undefined;

  // macOS replaces itself with a signed zip of the release, as electron-updater needs a Developer ID there. See docs/app/updater.md
  return process.platform === 'darwin' ? createMacUpdateSource(appDataPath) : autoUpdater;
};

// the splash and the settings share one source; the settings flow starts after the splash one is done
const updateSource = getUpdateSource();
const updatePreference = readUpdatePreference(appDataPath);
const updates = createUpdateManager({
  source: updateSource,
  info: { version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, unavailable },
  ...updatePreference,
  saveAutomatic: (automatic) => saveUpdatePreference(appDataPath, { automatic }),
  saveAllowMetered: (allowMetered) => saveUpdatePreference(appDataPath, { allowMetered }),
  publish: (state) => windows.main?.webContents.send('UPDATE_STATE', state),
});

// the splash stays up while the update is checked and downloaded, the app starts once it is done; the user can turn this off and update from the settings
const updateOnSplash = async (main: BrowserWindow) => {
  if (!updateSource || !updates.getState().automatic) return;

  return runUpdate(updateSource, (progress) => sendIfAlive(main.webContents, 'SPLASH_PROGRESS', progress), {
    install: !isMockUpdate,
    translate: getMainTranslator().t,
    // a metered connection asks on the splash first, the version check above is small and stays as it is
    confirmDownload: async (version) => {
      if (updates.getState().allowMetered || !(await isMeteredConnection())) return true;

      const download = await askOnSplash(main, {
        text: getMainTranslator().t('update.metered', { version }),
        download: getMainTranslator().t('update.metered.download'),
        notNow: getMainTranslator().t('update.metered.notNow'),
      });
      // the question goes away with the answer: the download reports its own text next, "Not now" falls back to the loading text
      sendIfAlive(main.webContents, 'SPLASH_PROGRESS', { text: getMainTranslator().t('splash.loading', { title: 'Tunelle' }) });

      return download;
    },
  });
};

let startup: ReturnType<typeof createStartupSignal> | undefined;

app
  .whenReady()
  .then(serveApp)
  .then(async () => {
    const main = openWindow();
    startup = createStartupSignal(main);
    await loadPage(main, windowLocation);
    // the splash is static and shows the text the main process sends; the picked language is in the library, which opens after the splash
    sendIfAlive(main.webContents, 'SPLASH_PROGRESS', { text: getMainTranslator().t('splash.loading', { title: 'Tunelle' }) });

    return updateOnSplash(main);
  })
  .then(() =>
    createDatabase(libraryLocation).catch((error) => {
      const translator = getMainTranslator();
      dialog.showErrorBox(translator.t('library.error.title'), libraryErrorMessage(translator, error));
      throw error;
    })
  )
  .then((d) => {
    console.log(`Connected to library ${libraryLocation}`);
    // the swap script of an update waits for this before it drops the backup of the old version
    if (process.platform === 'darwin') confirmStart(appDataPath).catch((error) => console.error('The start was not recorded', error));
    global._database = d;

    return getSettings(d)
      .then((settings) => {
        setPickedLanguage(settings);
        applyThemeMode(settings);
        startPowerState();
        applyPowerSetting(settings);
      })
      .then(() => d);
  })
  .then((d) => {
    // the window was closed while the library opened: the app is quitting, and the database is closed before that
    if (!windows.main) return closeDatabase(d);

    // the hidden window of the measurement is a window too: the app does not quit while it is open
    const loudness = registerLoudness(d, loudnessLocation, (status) => windows.main && sendIfAlive(windows.main.webContents, 'LOUDNESS_STATUS', status));
    windows.main?.on('closed', loudness.stop);
    setupListeners(d, windows, radio, radioArt, updates, loudness);
    backgroundQueue.start();

    // the native sqlite3 addon aborts the process when it is torn down with the database open, so it is closed before the app exits
    let databaseClosed = false;
    app.on('will-quit', (event) => {
      if (databaseClosed) return;

      event.preventDefault();
      databaseClosed = true;
      closeDatabase(d).then(() => app.quit());
    });

    // the app waits for its windows to close before it quits; the main window closes on its own, as the page saves its settings on the way out
    // the database closes after its queued statements, which a running scan keeps adding to, so the scan stops first
    app.on('before-quit', () => {
      backgroundQueue.stop();
      loudness.stop();
      cancelScans();
    });

    app.on('window-all-closed', () => {
      if (!isMac) {
        app.quit();
      }
    });

    startup?.start();
  })
  .catch((msg) => {
    console.error(msg);
    process.exit(1);
  });
