import { app, dialog } from 'electron';
import type { BrowserWindow } from 'electron';
import { join, resolve } from 'path';
import fs from 'fs';
import minimist from 'minimist';
import ws from 'windows-shortcuts-appid';
import type { AppWindows } from './types/global';
import getAppDataPath from './electron/appDataPath';
import { readAutomaticUpdates, saveAutomaticUpdates } from './electron/updatePreference';
import { copyOldLibrary, copyOldUserData, getAppName } from './electron/userData';
import createWindow from './electron/createWindow';
import getLoadingWindow from './electron/getLoadingWindow';
import createDatabase from './electron/createDatabase';
import { libraryErrorMessage } from './electron/libraryErrorMessage';
import setupListeners from './electron/setupListeners';
import { tunelleOrigin, handleTunelleProtocol, registerTunelleScheme } from './electron/tunelleProtocol';
import { createRadioBrowser } from './electron/radioBrowser';
import { createRadioArt } from './electron/radioArt';
import { createRadioLogos } from './electron/radioLogos';
import { getAppUserModelId, setsAppUserModelId } from './electron/appUserModelId';
import { holdSingleInstance } from './electron/singleInstance';
import { registerDevDesktopEntry, removeDevDesktopEntry } from './electron/devDesktopEntry';
import closeDatabase from './electron/closeDatabase';
import { cancelScans } from './electron/scanCancellation';
import closeSplash from './electron/closeSplash';
import releaseWindows from './electron/releaseWindows';
import { getMainTranslator, setPickedLanguage } from './electron/language';
import { applyThemeMode } from './electron/theme';
import { getSettings } from './electron/settingsRepository';
import { autoUpdater } from 'electron-updater';
import { createMockUpdateSource, getUpdateUnavailableReason, runUpdate } from './electron/updater';
import { createUpdateManager } from './electron/updateManager';
import type { UpdateSource } from './electron/updater';

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
  () => windows.main ?? windows.loading,
  (code) => process.exit(code)
);

// the development window gets its icon on linux from this desktop entry, which only exists while it runs
if (isDev && process.platform === 'linux') {
  const dataHome = process.env.XDG_DATA_HOME || join(app.getPath('home'), '.local/share');

  app.setDesktopName('tunelle-dev.desktop');
  registerDevDesktopEntry(dataHome, resolve(__dirname, '../icons/png/512x512.png'));
  app.on('will-quit', () => removeDevDesktopEntry(dataHome));
}

// the entry the AppImage launcher installs (electron/appImageLauncher.ts), or the one the Flatpak installs under its id, so the running window gets its icon in the dock and taskbar
if (!isDev && process.platform === 'linux') {
  app.setDesktopName(`${process.env.FLATPAK_ID ?? 'tunelle'}.desktop`);
}

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
  loading: null,
};

// the page is served by the tunelle protocol; a development run loads it from the dev server, which asks the protocol across origins
const devOrigin = argv.webpackPort ? `http://localhost:${argv.webpackPort}` : undefined;
const pageOrigin = devOrigin ?? tunelleOrigin;
const windowLocation = `${pageOrigin}/index.html`;
const loadingLocation = `${pageOrigin}/loading.html`;

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

    if (fs.existsSync(shortcutPath)) {
      fs.unlinkSync(shortcutPath);
    }

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

const initWindow = () => {
  setAppId();
  windows.main = createWindow();
  windows.main.loadURL(windowLocation);

  windows.main.on('closed', () => releaseWindows(windows));
};

if (!fs.existsSync(appDataPath)) {
  fs.mkdirSync(appDataPath);
}

const libraryLocation = resolve(appDataPath, './library.sqlite');

// a test run asks a directory of its own, the real one needs the network
const radio = createRadioBrowser(`Tunelle/${app.getVersion()}`, process.env.TUNELLE_RADIO_DIRECTORY, {
  cachePath: resolve(appDataPath, './radio-mirrors.json'),
  streamsPath: resolve(appDataPath, './radio-streams.json'),
});

const radioArt = createRadioArt();

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
      onTitle: (uuid, title, streamUrl) => {
        windows.main?.webContents.send('RADIO_STREAM_TITLE', { uuid, title });
        radioArt
          .lookup(title, streamUrl)
          .then((art) => art && windows.main?.webContents.send('RADIO_STREAM_ART', { uuid, title, art }))
          .catch((error) => console.error(error));
      },
    },
  });

// a development run updates from the mock source only when asked to
const unavailable = isMockUpdate ? undefined : getUpdateUnavailableReason(app.isPackaged, process.platform, process.env, process.windowsStore);

const getUpdateSource = (): UpdateSource | undefined => {
  if (isMockUpdate) return createMockUpdateSource();

  return unavailable ? undefined : autoUpdater;
};

// the splash and the settings share one source; the settings flow starts after the splash one is done
const updateSource = getUpdateSource();
const updates = createUpdateManager({
  source: updateSource,
  info: { version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, unavailable },
  automatic: readAutomaticUpdates(appDataPath),
  saveAutomatic: (automatic) => saveAutomaticUpdates(appDataPath, automatic),
  publish: (state) => windows.main?.webContents.send('UPDATE_STATE', state),
});

// the splash stays up while the update is checked and downloaded, the app starts once it is done; the user can turn this off and update from the settings
const updateOnSplash = async (loading: BrowserWindow) => {
  if (!updateSource || !updates.getState().automatic) return;

  return runUpdate(updateSource, (progress) => loading.webContents.send('SPLASH_PROGRESS', progress), {
    install: !isMockUpdate,
    translate: getMainTranslator().t,
  });
};

app
  .whenReady()
  .then(serveApp)
  .then(async () => {
    const loading = getLoadingWindow();
    windows.loading = loading;
    loading.once('ready-to-show', () => {
      loading.show();
      if (isWin) loading.setBackgroundMaterial('acrylic');
    });
    await loading.loadURL(loadingLocation);
    // the splash page is static and shows the text the main process sends; the picked language is in the library, which opens after the splash
    loading.webContents.send('SPLASH_PROGRESS', { text: getMainTranslator().t('splash.loading', { title: 'Tunelle' }) });

    return updateOnSplash(loading);
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
    global._database = d;

    return getSettings(d)
      .then((settings) => {
        setPickedLanguage(settings);
        applyThemeMode(settings);
      })
      .then(() => d);
  })
  .then((d) => {
    initWindow();
    setupListeners(d, windows, radio, updates);

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
      cancelScans();
      closeSplash(windows);
    });

    app.on('window-all-closed', () => {
      if (!isMac) {
        app.quit();
      }
    });
  })
  .catch((msg) => {
    console.error(msg);
    process.exit(1);
  });
