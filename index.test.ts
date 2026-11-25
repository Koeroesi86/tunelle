import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs } from './electron/test-memory-fs';

const mocks = vi.hoisted(() => {
  const main = {
    once: vi.fn(),
    on: vi.fn(),
    show: vi.fn(),
    setBackgroundMaterial: vi.fn(),
    webContents: { send: vi.fn(), isDestroyed: () => false },
  };

  return {
    main,
    appEvents: new Map<string, ((...args: unknown[]) => unknown)[]>(),
    app: {
      whenReady: vi.fn(),
      on: vi.fn(),
      quit: vi.fn(),
      setName: vi.fn(),
      setDesktopName: vi.fn(),
      setAppUserModelId: vi.fn(),
      getPath: vi.fn(),
      getVersion: vi.fn(() => '26.11.1'),
      isPackaged: false,
      commandLine: { appendSwitch: vi.fn(), hasSwitch: vi.fn(() => false) },
    },
    dialog: { showErrorBox: vi.fn() },
    database: { name: 'database' },
    loudness: { stop: vi.fn() },
    startup: { start: vi.fn() },
    queue: { start: vi.fn(), stop: vi.fn() },
    updates: { getState: vi.fn() },
    updateSource: { name: 'electron-updater' },
    shortcuts: { create: vi.fn(), addAppId: vi.fn() },
    protocolDeps: [] as Record<string, unknown>[],
    manager: [] as Record<string, unknown>[],
  };
});

vi.mock('electron', () => ({ app: mocks.app, dialog: mocks.dialog }));
vi.mock('electron-updater', () => ({ autoUpdater: mocks.updateSource }));
vi.mock('windows-shortcuts-appid', () => ({ default: mocks.shortcuts }));
vi.mock('fs', () => ({ ...memoryFs.sync, default: memoryFs.sync }));
vi.mock('./electron/schemas/environment', () => ({ directoryUrlSchema: { parse: (value: string | undefined) => value } }));
vi.mock('./electron/utils/app-data-path', () => ({ default: vi.fn(() => '/data/tunelle') }));
vi.mock('./electron/services/updates/update-preference', () => ({
  readUpdatePreference: vi.fn(() => ({ automatic: true, allowMetered: false })),
  saveUpdatePreference: vi.fn(),
}));
vi.mock('./electron/services/updates/metered-connection', () => ({ isMeteredConnection: vi.fn() }));
vi.mock('./electron/services/updates/splash-confirm', () => ({ askOnSplash: vi.fn() }));
vi.mock('./electron/utils/user-data', () => ({ copyOldLibrary: vi.fn(), copyOldUserData: vi.fn(() => false), getAppName: vi.fn(() => 'Tunelle') }));
vi.mock('./electron/windows/create-window', () => ({ default: vi.fn(() => mocks.main) }));
vi.mock('./electron/windows/gpu-acceleration', () => ({ detectSoftwareRendering: vi.fn(), isSoftwareRendering: vi.fn(() => false) }));
vi.mock('./electron/services/platform/startup-signal', () => ({ createStartupSignal: vi.fn(() => mocks.startup) }));
vi.mock('./electron/windows/load-page', () => ({ default: vi.fn(async () => undefined) }));
vi.mock('./electron/database/create-database', () => ({ default: vi.fn(async () => mocks.database) }));
vi.mock('./electron/utils/library-error-message', () => ({ libraryErrorMessage: vi.fn(() => 'the library can not be opened') }));
vi.mock('./electron/listeners/setup-listeners', () => ({ default: vi.fn() }));
vi.mock('./electron/protocols/decoded-track', () => ({ removeOldCache: vi.fn(async () => undefined) }));
vi.mock('./electron/protocols/tunelle-protocol', () => ({
  tunelleOrigin: 'tunelle://app',
  registerTunelleScheme: vi.fn(),
  handleTunelleProtocol: vi.fn((deps: Record<string, unknown>) => void mocks.protocolDeps.push(deps)),
}));
vi.mock('./electron/services/radio/radio-browser', () => ({ createRadioBrowser: vi.fn(() => ({ resolveStream: vi.fn(), getLogoUrl: vi.fn() })) }));
vi.mock('./electron/services/sources/sources', () => ({ createSources: vi.fn(() => ({ clientOf: vi.fn() })) }));
vi.mock('./electron/services/radio/radio-art', () => ({ createRadioArt: vi.fn(() => ({ get: vi.fn(), lookup: vi.fn(async () => 'art.png') })) }));
vi.mock('./electron/services/radio/radio-logos', () => ({ createRadioLogos: vi.fn(() => ({ get: vi.fn() })) }));
vi.mock('./electron/app-user-model-id', () => ({ getAppUserModelId: vi.fn(() => 'io.github.tunelle'), setsAppUserModelId: vi.fn(() => true) }));
vi.mock('./electron/windows/single-instance', () => ({ holdSingleInstance: vi.fn() }));
vi.mock('./electron/services/platform/dev-desktop-entry', () => ({ registerDevDesktopEntry: vi.fn(), removeDevDesktopEntry: vi.fn() }));
vi.mock('./electron/database/close-database', () => ({ default: vi.fn(async () => undefined) }));
vi.mock('./electron/utils/send-if-alive', () => ({ sendIfAlive: vi.fn() }));
vi.mock('./electron/library/scan/scan-cancellation', () => ({ cancelScans: vi.fn() }));
vi.mock('./electron/library/tasks/background-queue', () => ({ backgroundQueue: mocks.queue }));
vi.mock('./electron/library/loudness/loudness-source', () => ({ registerLoudness: vi.fn(() => mocks.loudness) }));
vi.mock('./electron/language', () => ({ getMainTranslator: vi.fn(() => ({ t: (key: string) => key })), setPickedLanguage: vi.fn() }));
vi.mock('./electron/theme', () => ({ applyThemeMode: vi.fn() }));
vi.mock('./electron/power/power-state', () => ({ applyPowerSetting: vi.fn(), startPowerState: vi.fn() }));
vi.mock('./electron/repositories/settings-repository', () => ({ getSettings: vi.fn(async () => ({ language: 'hu' })) }));
vi.mock('./electron/services/updates/updater', () => ({
  createMockUpdateSource: vi.fn(() => ({ name: 'mock' })),
  getUpdateUnavailableReason: vi.fn(() => undefined),
  inspectAppImage: vi.fn(() => ({ managedByAm: false, writable: true })),
  inspectMacInstall: vi.fn(() => ({ translocated: false, writable: true })),
  runUpdate: vi.fn(async () => undefined),
}));
vi.mock('./electron/services/updates/mac-update-source', () => ({
  bundleOf: vi.fn(() => '/Applications/Tunelle.app'),
  confirmStart: vi.fn(async () => undefined),
  createMacUpdateSource: vi.fn(() => ({ name: 'mac' })),
}));
vi.mock('./electron/services/updates/update-manager', () => ({
  createUpdateManager: vi.fn((options: Record<string, unknown>) => {
    mocks.manager.push(options);

    return mocks.updates;
  }),
}));

describe('the start of the app', () => {
  const root = resolve(__dirname, '..');
  const platformOf = Object.getOwnPropertyDescriptor(process, 'platform');
  const argvOf = process.argv;
  let exit: ReturnType<typeof vi.spyOn>;
  let ready: Promise<void>;

  const platform = (name: string) => Object.defineProperty(process, 'platform', { value: name, configurable: true });

  /** Loads index.ts, which starts the app as it loads, and gives the modules it used */
  const start = async (...flags: string[]) => {
    process.argv = ['electron', 'out/index.js', ...flags];
    vi.resetModules();
    await import('./index');
    const modules = {
      createDatabase: (await import('./electron/database/create-database')).default,
      closeDatabase: (await import('./electron/database/close-database')).default,
      setupListeners: (await import('./electron/listeners/setup-listeners')).default,
      userData: await import('./electron/utils/user-data'),
      updater: await import('./electron/services/updates/updater'),
      macSource: await import('./electron/services/updates/mac-update-source'),
      devEntry: await import('./electron/services/platform/dev-desktop-entry'),
      singleInstance: await import('./electron/windows/single-instance'),
      loadPage: (await import('./electron/windows/load-page')).default,
      sendIfAlive: (await import('./electron/utils/send-if-alive')).sendIfAlive,
      metered: await import('./electron/services/updates/metered-connection'),
      splash: await import('./electron/services/updates/splash-confirm'),
      cancelScans: (await import('./electron/library/scan/scan-cancellation')).cancelScans,
      radioArt: await import('./electron/services/radio/radio-art'),
      appId: await import('./electron/app-user-model-id'),
      removeOldCache: (await import('./electron/protocols/decoded-track')).removeOldCache,
    };

    return modules;
  };

  const started = () => vi.waitFor(() => expect(mocks.startup.start).toHaveBeenCalled());
  /** The listeners that the app registered for an event of `app`, called together as Electron does */
  const event =
    (name: string) =>
    (...args: unknown[]) =>
      mocks.appEvents.get(name)?.forEach((listener) => listener(...args));

  beforeEach(async () => {
    memoryFs.reset();
    memoryFs.sync.mkdirSync(root);
    memoryFs.sync.writeFileSync(resolve(root, 'package.json'), JSON.stringify({ name: 'tunelle', description: 'Lossless audio' }));
    mocks.appEvents.clear();
    mocks.protocolDeps.length = 0;
    mocks.manager.length = 0;
    mocks.app.isPackaged = false;
    mocks.app.getPath.mockImplementation((name: string) => `/paths/${name}`);
    mocks.app.on.mockImplementation(
      (name: string, listener: (...args: unknown[]) => unknown) => void mocks.appEvents.set(name, [...(mocks.appEvents.get(name) ?? []), listener])
    );
    ready = Promise.resolve();
    mocks.app.whenReady.mockImplementation(() => ready);
    mocks.updates.getState.mockReturnValue({ automatic: true, allowMetered: false });
    mocks.main.once.mockReset();
    mocks.main.on.mockReset();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TUNELLE_APP_DATA', '');
    vi.stubEnv('MOCK_UPDATE', '');
    vi.stubEnv('FLATPAK_ID', undefined);
    vi.stubEnv('XDG_DATA_HOME', '');
    vi.stubEnv('APPIMAGE', '');
    platform('linux');
    // the mocks keep what a test set, so each test starts from the same ones
    const [{ default: createDatabase }, { default: loadPage }, { copyOldUserData }, { confirmStart }, { setsAppUserModelId }] = await Promise.all([
      import('./electron/database/create-database'),
      import('./electron/windows/load-page'),
      import('./electron/utils/user-data'),
      import('./electron/services/updates/mac-update-source'),
      import('./electron/app-user-model-id'),
    ]);
    vi.mocked(createDatabase).mockResolvedValue(mocks.database as never);
    vi.mocked(loadPage).mockResolvedValue(undefined);
    vi.mocked(copyOldUserData).mockReturnValue(false);
    vi.mocked(confirmStart).mockResolvedValue(undefined);
    vi.mocked(setsAppUserModelId).mockReturnValue(true);
    mocks.app.commandLine.hasSwitch.mockReturnValue(false);
    // a development run has no update, a packaged one has
    const { getUpdateUnavailableReason } = await import('./electron/services/updates/updater');
    vi.mocked(getUpdateUnavailableReason).mockImplementation((isPackaged) => (isPackaged ? undefined : 'development'));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    process.argv = argvOf;
    if (platformOf) Object.defineProperty(process, 'platform', platformOf);
  });

  it('opens the window with the splash, then the library, and then the listeners, the queue and the page', async () => {
    const modules = await start();
    await started();

    expect(modules.loadPage).toHaveBeenCalledWith(mocks.main, 'tunelle://app/index.html');
    expect(modules.sendIfAlive).toHaveBeenCalledWith(mocks.main.webContents, 'SPLASH_PROGRESS', { text: 'splash.loading' });
    expect(modules.createDatabase).toHaveBeenCalledWith(resolve('/data/tunelle', './library.sqlite'));
    expect(modules.setupListeners).toHaveBeenCalledWith(
      mocks.database,
      { main: mocks.main },
      expect.anything(),
      expect.anything(),
      expect.anything(),
      mocks.updates,
      mocks.loudness
    );
    expect(mocks.queue.start).toHaveBeenCalled();
    expect(mocks.app.setName).toHaveBeenCalledWith('Tunelle');
    expect(memoryFs.sync.existsSync('/data/tunelle')).toBe(true);
    expect(modules.singleInstance.holdSingleInstance).toHaveBeenCalled();
    expect(modules.removeOldCache).toHaveBeenCalled();
    expect(mocks.app.commandLine.appendSwitch).toHaveBeenCalledWith('disable-features', 'MediaSessionService');
  });

  it('shows the window when it is ready, with the acrylic material on Windows', async () => {
    platform('win32');
    await start();
    await started();
    const [, ready] = mocks.main.once.mock.calls.find(([name]) => name === 'ready-to-show') ?? [];

    ready();

    expect(mocks.main.show).toHaveBeenCalled();
    expect(mocks.main.setBackgroundMaterial).toHaveBeenCalledWith('acrylic');
  });

  it('forgets the window when it is closed', async () => {
    await start();
    await started();
    const [, closed] = mocks.main.on.mock.calls.find(([name]) => name === 'closed') ?? [];

    closed();

    expect(mocks.main.on).toHaveBeenCalledWith('closed', expect.any(Function));
  });

  it('serves the page of the dev server across origins when it is given a port', async () => {
    const modules = await start('--webpackPort=3000');
    await started();

    expect(modules.loadPage).toHaveBeenCalledWith(mocks.main, 'http://localhost:3000/index.html');
    expect(mocks.protocolDeps[0].devOrigin).toBe('http://localhost:3000');
  });

  describe('the profile', () => {
    it('copies the data of the old names once, before the folder of the new one is made', async () => {
      const modules = await start();

      expect(modules.userData.copyOldUserData).toHaveBeenCalledWith(join('/paths/appData', 'eMusic'), join('/paths/appData', 'Tunelle'));
      expect(modules.userData.copyOldUserData).toHaveBeenCalledWith(join('/paths/appData', 'electron-music-player'), join('/paths/appData', 'Tunelle'));
      expect(modules.userData.copyOldLibrary).toHaveBeenCalledWith(join('/paths/appData', 'electron-music-player'), join('/paths/appData', 'tunelle'));
    });

    it('stops at the first old folder that was copied', async () => {
      const { copyOldUserData } = await import('./electron/utils/user-data');
      vi.mocked(copyOldUserData).mockReturnValue(true);

      await start();

      expect(copyOldUserData).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['a data folder of its own', () => vi.stubEnv('TUNELLE_APP_DATA', '/own')],
      ['a development run', () => vi.stubEnv('NODE_ENV', 'development')],
      ['a user data folder on the command line', () => vi.mocked(mocks.app.commandLine.hasSwitch).mockReturnValue(true)],
    ])('is left alone with %s', async (_name, setUp) => {
      setUp();

      const modules = await start();

      expect(modules.userData.copyOldUserData).not.toHaveBeenCalled();
    });
  });

  describe('on Linux', () => {
    it('gives the development window the icon of a desktop entry that lives while it runs', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('XDG_DATA_HOME', '/xdg');

      const modules = await start();
      event('will-quit')?.({ preventDefault: vi.fn() });

      expect(mocks.app.setDesktopName).toHaveBeenCalledWith('tunelle-dev.desktop');
      expect(modules.devEntry.registerDevDesktopEntry).toHaveBeenCalledWith('/xdg', resolve(root, 'icons/png/512x512.png'));
      expect(modules.devEntry.removeDevDesktopEntry).toHaveBeenCalledWith('/xdg');
    });

    it('looks for the data home in the home folder without XDG_DATA_HOME', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      const modules = await start();

      expect(modules.devEntry.registerDevDesktopEntry).toHaveBeenCalledWith(join('/paths/home', '.local/share'), expect.any(String));
    });

    it.each([
      [undefined, 'tunelle.desktop'],
      ['io.github.koeroesi86.Tunelle', 'io.github.koeroesi86.Tunelle.desktop'],
    ])('names the entry of the running window after the install (FLATPAK_ID %j)', async (id, expected) => {
      vi.stubEnv('FLATPAK_ID', id);

      await start();

      expect(mocks.app.setDesktopName).toHaveBeenCalledWith(expected);
    });

    it('keeps the media controls of Chromium out, as the app has its own player service', async () => {
      platform('darwin');

      await start();

      expect(mocks.app.commandLine.appendSwitch).not.toHaveBeenCalled();
      expect(mocks.app.setDesktopName).not.toHaveBeenCalled();
    });
  });

  describe('the app id', () => {
    it('is set where the system takes one', async () => {
      platform('win32');

      await start();
      await started();

      expect(mocks.app.setAppUserModelId).toHaveBeenCalledWith('io.github.tunelle');
    });

    it('is not set where the system takes none', async () => {
      const modules = await start();
      vi.mocked(modules.appId.setsAppUserModelId).mockReturnValue(false);
      await started();

      expect(mocks.shortcuts.create).not.toHaveBeenCalled();
    });

    it('is attached to a start menu shortcut of a development run on Windows, which is made again each time', async () => {
      platform('win32');
      vi.stubEnv('NODE_ENV', 'development');
      memoryFs.sync.mkdirSync('/paths/appData');

      await start();
      await started();
      const [shortcut, options, done] = mocks.shortcuts.create.mock.calls[0];
      done(undefined);

      expect(shortcut).toBe('/paths/appData\\Microsoft\\Windows\\Start Menu\\Programs\\Tunelle-development.lnk');
      expect(options).toMatchObject({ target: process.execPath, desc: 'Lossless audio', workingDir: root });
      expect(mocks.shortcuts.addAppId).toHaveBeenCalledWith(shortcut, 'io.github.tunelle', expect.any(Function));
      expect(() => mocks.shortcuts.addAppId.mock.calls[0][2](undefined)).not.toThrow();
    });

    it('fails the start when the shortcut can not be made or given the id', async () => {
      platform('win32');
      vi.stubEnv('NODE_ENV', 'development');

      await start();
      await started();
      const [, , done] = mocks.shortcuts.create.mock.calls[0];

      expect(() => done(new Error('no shortcut'))).toThrow('no shortcut');
      done(undefined);
      expect(() => mocks.shortcuts.addAppId.mock.calls[0][2](new Error('no id'))).toThrow('no id');
    });
  });

  describe('the updates', () => {
    it('checks and installs on the splash when the app can update itself', async () => {
      mocks.app.isPackaged = true;
      const modules = await start();
      await started();

      expect(modules.updater.getUpdateUnavailableReason).toHaveBeenCalledWith(true, 'linux', process.env, undefined, undefined, undefined);
      expect(vi.mocked(modules.updater.runUpdate).mock.calls[0][0]).toBe(mocks.updateSource);
    });

    it('uses electron-updater on Linux and Windows, and the signed zip on macOS', async () => {
      vi.resetModules();
      const linux = await start();
      await started();
      expect(mocks.manager[0].source).toBeUndefined();

      mocks.manager.length = 0;
      mocks.app.isPackaged = true;
      await start();
      expect(mocks.manager[0].source).toBe(mocks.updateSource);

      mocks.manager.length = 0;
      platform('darwin');
      await start();
      expect(mocks.manager[0].source).toEqual({ name: 'mac' });
      expect(linux.macSource.createMacUpdateSource).toHaveBeenCalledWith('/data/tunelle');
    });

    it('inspects the AppImage and the bundle of the install', async () => {
      vi.stubEnv('APPIMAGE', '/apps/Tunelle.AppImage');
      mocks.app.isPackaged = true;

      const modules = await start();
      expect(modules.updater.inspectAppImage).toHaveBeenCalledWith('/apps/Tunelle.AppImage');

      platform('darwin');
      await start();
      expect(modules.updater.inspectMacInstall).toHaveBeenCalledWith('/Applications/Tunelle.app');
    });

    it('uses the mock source of a development run that asks for it, and does not install what it downloads', async () => {
      vi.stubEnv('MOCK_UPDATE', '1');
      const modules = await start();
      await started();

      expect(mocks.manager[0].source).toEqual({ name: 'mock' });
      expect(modules.updater.getUpdateUnavailableReason).not.toHaveBeenCalled();
      expect(vi.mocked(modules.updater.runUpdate).mock.calls[0][2]).toMatchObject({ install: false });
    });

    it('does not check on the splash when the user turned it off, or when there is no source', async () => {
      mocks.updates.getState.mockReturnValue({ automatic: false, allowMetered: false });
      vi.stubEnv('MOCK_UPDATE', '1');
      const modules = await start();
      await started();

      expect(modules.updater.runUpdate).not.toHaveBeenCalled();
    });

    it('saves the choices of the user, and tells the window about the state', async () => {
      const { saveUpdatePreference } = await import('./electron/services/updates/update-preference');
      await start();
      await started();
      const options = mocks.manager[0] as {
        saveAutomatic: (value: boolean) => void;
        saveAllowMetered: (value: boolean) => void;
        publish: (state: unknown) => void;
      };

      options.saveAutomatic(false);
      options.saveAllowMetered(true);
      options.publish({ state: 'idle' });

      expect(saveUpdatePreference).toHaveBeenCalledWith('/data/tunelle', { automatic: false });
      expect(saveUpdatePreference).toHaveBeenCalledWith('/data/tunelle', { allowMetered: true });
      expect(mocks.main.webContents.send).toHaveBeenCalledWith('UPDATE_STATE', { state: 'idle' });
    });

    describe('on a metered connection', () => {
      const confirm = async () => {
        vi.stubEnv('MOCK_UPDATE', '1');
        const modules = await start();
        await started();
        const options = vi.mocked(modules.updater.runUpdate).mock.calls[0][2];

        return { modules, ask: () => options?.confirmDownload?.('26.11.2') };
      };

      it('downloads without asking when the settings allow it, or the connection is not metered', async () => {
        const { modules, ask } = await confirm();
        mocks.updates.getState.mockReturnValue({ automatic: true, allowMetered: true });
        expect(await ask()).toBe(true);

        mocks.updates.getState.mockReturnValue({ automatic: true, allowMetered: false });
        vi.mocked(modules.metered.isMeteredConnection).mockResolvedValue(false);
        expect(await ask()).toBe(true);
        expect(modules.splash.askOnSplash).not.toHaveBeenCalled();
      });

      it.each([true, false])('asks on the splash, and answers %s with what the user chose', async (answer) => {
        const { modules, ask } = await confirm();
        vi.mocked(modules.metered.isMeteredConnection).mockResolvedValue(true);
        vi.mocked(modules.splash.askOnSplash).mockResolvedValue(answer);

        expect(await ask()).toBe(answer);
        expect(modules.splash.askOnSplash).toHaveBeenCalledWith(mocks.main, {
          text: 'update.metered',
          download: 'update.metered.download',
          notNow: 'update.metered.notNow',
        });
        expect(modules.sendIfAlive).toHaveBeenCalledWith(mocks.main.webContents, 'SPLASH_PROGRESS', { text: 'splash.loading' });
      });
    });
  });

  describe('the tunelle protocol', () => {
    it('serves the page from the build folder and the library from the database that is open by then', async () => {
      await start();
      await started();
      const deps = mocks.protocolDeps[0] as { appRoot: string; getDatabase: () => unknown };

      expect(deps.appRoot).toBe(resolve(root, 'build'));
      expect(deps.getDatabase()).toBe(mocks.database);
    });

    it('tells the window the sample rate and the title of a station, and looks up the art for the title', async () => {
      const modules = await start();
      await started();
      const { radio } = mocks.protocolDeps[0] as { radio: { onSampleRate: (...args: unknown[]) => void; onTitle: (...args: unknown[]) => void } };

      radio.onSampleRate('uuid', 44100);
      radio.onTitle('uuid', 'Song', 'http://stream');
      await vi.waitFor(() => expect(mocks.main.webContents.send).toHaveBeenCalledWith('RADIO_STREAM_ART', { uuid: 'uuid', title: 'Song', art: 'art.png' }));

      expect(mocks.main.webContents.send).toHaveBeenCalledWith('RADIO_STREAM_RATE', { uuid: 'uuid', sampleRate: 44100 });
      expect(mocks.main.webContents.send).toHaveBeenCalledWith('RADIO_STREAM_TITLE', { uuid: 'uuid', title: 'Song' });
      expect(modules.radioArt.createRadioArt).toHaveBeenCalled();
    });

    it('logs a lookup of the art that fails and keeps playing', async () => {
      const modules = await start();
      await started();
      const art = vi.mocked(modules.radioArt.createRadioArt).mock.results[0].value as { lookup: ReturnType<typeof vi.fn> };
      art.lookup.mockRejectedValue(new Error('no art'));
      const { radio } = mocks.protocolDeps[0] as { radio: { onTitle: (...args: unknown[]) => void } };

      radio.onTitle('uuid', 'Song', 'http://stream');

      await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith(new Error('no art')));
    });
  });

  describe('the library', () => {
    it('opens with the language, the theme and the power setting of the user', async () => {
      await start();
      await started();
      const { setPickedLanguage } = await import('./electron/language');
      const { applyThemeMode } = await import('./electron/theme');
      const { applyPowerSetting, startPowerState } = await import('./electron/power/power-state');

      expect(setPickedLanguage).toHaveBeenCalledWith({ language: 'hu' });
      expect(applyThemeMode).toHaveBeenCalledWith({ language: 'hu' });
      expect(startPowerState).toHaveBeenCalled();
      expect(applyPowerSetting).toHaveBeenCalledWith({ language: 'hu' });
    });

    it('records the start for the swap script of an update on macOS, and logs it when that fails', async () => {
      platform('darwin');
      const { confirmStart } = await import('./electron/services/updates/mac-update-source');
      vi.mocked(confirmStart).mockRejectedValue(new Error('disk full'));
      const modules = await start();
      await started();

      expect(modules.macSource.confirmStart).toHaveBeenCalledWith('/data/tunelle');
      await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith('The start was not recorded', new Error('disk full')));
    });

    it('shows why the library can not be opened and ends the app', async () => {
      const { default: createDatabase } = await import('./electron/database/create-database');
      vi.mocked(createDatabase).mockRejectedValue(new Error('corrupt'));

      await start();
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));

      expect(mocks.dialog.showErrorBox).toHaveBeenCalledWith('library.error.title', 'the library can not be opened');
      expect(mocks.queue.start).not.toHaveBeenCalled();
    });

    it('closes the library again when the window was closed while it opened, and starts nothing', async () => {
      const { default: loadPage } = await import('./electron/windows/load-page');
      vi.mocked(loadPage).mockImplementation(async () => {
        mocks.main.on.mock.calls.find(([name]) => name === 'closed')?.[1]();
      });

      const modules = await start();
      await vi.waitFor(() => expect(modules.closeDatabase).toHaveBeenCalledWith(mocks.database));

      expect(modules.setupListeners).not.toHaveBeenCalled();
      expect(mocks.queue.start).not.toHaveBeenCalled();
    });
  });

  describe('leaving', () => {
    it('closes the database before the app quits, once, as the native addon aborts the process when it is torn down open', async () => {
      const modules = await start();
      await started();
      const preventDefault = vi.fn();

      event('will-quit')?.({ preventDefault });
      event('will-quit')?.({ preventDefault });
      await vi.waitFor(() => expect(mocks.app.quit).toHaveBeenCalled());

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(modules.closeDatabase).toHaveBeenCalledTimes(1);
    });

    it('stops the queue, the measurement and the scans before it', async () => {
      const modules = await start();
      await started();

      event('before-quit')?.();

      expect(mocks.queue.stop).toHaveBeenCalled();
      expect(mocks.loudness.stop).toHaveBeenCalled();
      expect(modules.cancelScans).toHaveBeenCalled();
    });

    it('quits when the last window is closed, but not on macOS', async () => {
      await start();
      await started();
      event('window-all-closed')?.();
      expect(mocks.app.quit).toHaveBeenCalledTimes(1);

      mocks.app.quit.mockClear();
      mocks.appEvents.clear();
      platform('darwin');
      await start();
      await started();
      event('window-all-closed')?.();

      expect(mocks.app.quit).not.toHaveBeenCalled();
    });

    it('stops the measurement with the main window', async () => {
      await start();
      await started();
      const [, closed] = mocks.main.on.mock.calls.filter(([name]) => name === 'closed').at(-1) ?? [];

      closed();

      expect(mocks.loudness.stop).toHaveBeenCalled();
    });

    it('asks the single instance to leave through process.exit', async () => {
      const modules = await start();
      const [, , leave] = vi.mocked(modules.singleInstance.holdSingleInstance).mock.calls[0];

      leave(0);

      expect(exit).toHaveBeenCalledWith(0);
    });
  });
});
