import { mkdir, mkdtemp, readdir, readFile, readlink, rm, stat, utimes, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { normalize, posix } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDesktopEntry,
  disableLauncher,
  enableLauncher,
  getLauncherLink,
  hasOtherLauncher,
  isLauncherEnabled,
  markLauncherOffered,
  readLauncherTarget,
  syncLauncher,
  wasLauncherOffered,
} from './appImageLauncher';
import type { LauncherOptions } from './appImageLauncher';

// the entry only takes paths without a backslash, the temporary folder of Windows is full of them
const { join } = posix;
const createFolder = (prefix: string) => mkdtemp(join(tmpdir(), prefix)).then((folder) => folder.replaceAll('\\', '/'));

const sizes = [16, 24, 32, 48, 64, 128, 256, 512];

describe('buildDesktopEntry', () => {
  it('starts the AppImage and groups the window with the entry', () => {
    const entry = buildDesktopEntry('/home/me/Apps/Tunelle-26.10.1.AppImage');

    expect(entry).toContain('Exec="/home/me/Apps/Tunelle-26.10.1.AppImage" %U');
    expect(entry).toContain('Comment=Lossless Audio Player');
    expect(entry).toContain('Comment[hu]=');
    expect(entry).toContain('Icon=tunelle');
    expect(entry).toContain('Categories=AudioVideo;Audio;Music;Player;');
    expect(entry).toContain('StartupWMClass=Tunelle');
  });

  it('keeps a path with spaces in one piece', () => {
    expect(buildDesktopEntry('/home/me/My Apps/Tunelle.AppImage')).toContain('Exec="/home/me/My Apps/Tunelle.AppImage" %U');
  });

  it.each(['/home/me/a"b.AppImage', '/home/me/$HOME.AppImage', '/home/me/100%.AppImage', '/home/me/a\\b.AppImage', '/home/me/a\nb.AppImage'])(
    'refuses %j, it would break the Exec key',
    (path) => {
      expect(() => buildDesktopEntry(path)).toThrow('can not be used in a desktop entry');
    }
  );
});

describe('launcher on disk', () => {
  let folder: string;
  let options: LauncherOptions;
  let refresh: ReturnType<typeof vi.fn<(applicationsPath: string) => Promise<void>>>;
  const appImage = () => join(folder, 'Apps/Tunelle.AppImage');

  const createAppImage = (path: string) => mkdir(join(path, '..'), { recursive: true }).then(() => writeFile(path, ''));
  const link = () => getLauncherLink(options.dataHome);
  const desktopFile = () => join(folder, 'data/applications/tunelle.desktop');
  const exists = (path: string) =>
    stat(path).then(
      () => true,
      () => false
    );

  beforeEach(async () => {
    folder = await createFolder('tunelle-launcher-');
    await mkdir(join(folder, 'icons'));
    await Promise.all(sizes.map((size) => writeFile(join(folder, 'icons', `${size}x${size}.png`), `icon ${size}`)));
    refresh = vi.fn(() => Promise.resolve());
    options = { dataHome: join(folder, 'data'), iconsPath: join(folder, 'icons'), refresh };
  });

  afterEach(() => rm(folder, { recursive: true, force: true }));

  it('is not enabled before it was added', async () => {
    await expect(isLauncherEnabled(options.dataHome)).resolves.toBe(false);
    await expect(readLauncherTarget(options.dataHome)).resolves.toBeUndefined();
  });

  it('adds the entry and the icons, and tells the desktop', async () => {
    await enableLauncher(appImage(), options);

    await expect(readFile(desktopFile(), 'utf8')).resolves.toBe(buildDesktopEntry(link()));
    await expect(readFile(join(folder, 'data/icons/hicolor/256x256/apps/tunelle.png'), 'utf8')).resolves.toBe('icon 256');
    await expect(readdir(join(folder, 'data/icons/hicolor'))).resolves.toHaveLength(sizes.length);
    await expect(isLauncherEnabled(options.dataHome)).resolves.toBe(true);
    await expect(readLauncherTarget(options.dataHome)).resolves.toBe(appImage());
    expect(refresh).toHaveBeenCalledExactlyOnceWith(normalize(join(folder, 'data/applications')));
  });

  it('makes the icon theme newer than the icon cache of the desktop when the icons are rewritten', async () => {
    const theme = join(folder, 'data/icons/hicolor');
    await enableLauncher(appImage(), options);
    const past = new Date('2020-01-01');
    await utimes(theme, past, past);

    await enableLauncher(appImage(), options);

    expect((await stat(theme)).mtime.getTime()).toBeGreaterThan(past.getTime());
  });

  it('keeps the entry as it is when the AppImage changes, as the desktop shell keeps the entry it read first', async () => {
    await enableLauncher(appImage(), options);
    const entry = await readFile(desktopFile(), 'utf8');
    await enableLauncher(join(folder, 'other/Tunelle-26.10.7.AppImage'), options);

    await expect(readFile(desktopFile(), 'utf8')).resolves.toBe(entry);
    await expect(readlink(link()).then((target) => target.replaceAll('\\', '/'))).resolves.toBe(join(folder, 'other/Tunelle-26.10.7.AppImage'));
    await expect(readdir(join(folder, 'data/tunelle'))).resolves.toEqual(['Tunelle.AppImage']);
  });

  it('starts an AppImage with a path the entry can not hold, through the link', async () => {
    await enableLauncher(join(folder, 'a"b$c.AppImage'), options);

    await expect(readLauncherTarget(options.dataHome)).resolves.toBe(join(folder, 'a"b$c.AppImage'));
  });

  it('leaves nothing behind when the folder of the link can not be used', async () => {
    const unsafe = { ...options, dataHome: join(folder, 'a"b') };

    await expect(enableLauncher(appImage(), unsafe)).rejects.toThrow('can not be used');

    await expect(exists(join(folder, 'a"b'))).resolves.toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('removes the entry and the icons, and keeps the other files of the user', async () => {
    const other = join(folder, 'data/applications/other.desktop');
    await enableLauncher(appImage(), options);
    await writeFile(other, 'keep');

    await disableLauncher(options);

    await expect(isLauncherEnabled(options.dataHome)).resolves.toBe(false);
    await expect(exists(link())).resolves.toBe(false);
    await expect(exists(join(folder, 'data/icons/hicolor/512x512/apps/tunelle.png'))).resolves.toBe(false);
    await expect(readFile(other, 'utf8')).resolves.toBe('keep');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('can be removed when it was never added', async () => {
    await expect(disableLauncher(options)).resolves.toBeUndefined();
  });

  describe('syncLauncher', () => {
    it('does nothing without an entry', async () => {
      await syncLauncher(appImage(), options);

      await expect(isLauncherEnabled(options.dataHome)).resolves.toBe(false);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('leaves an entry alone while its AppImage exists', async () => {
      const first = join(folder, 'first/Tunelle.AppImage');
      await createAppImage(first);
      await enableLauncher(first, options);
      refresh.mockClear();

      await syncLauncher(appImage(), options);

      await expect(readLauncherTarget(options.dataHome)).resolves.toBe(first);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('leaves the entry of the running AppImage alone while its content is the same', async () => {
      await createAppImage(appImage());
      await enableLauncher(appImage(), options);
      refresh.mockClear();

      await syncLauncher(appImage(), options);

      expect(refresh).not.toHaveBeenCalled();
    });

    it('rewrites the entry of the running AppImage when its content changed', async () => {
      await createAppImage(appImage());
      await enableLauncher(appImage(), options);
      await writeFile(desktopFile(), buildDesktopEntry(link()).replace('Icon=tunelle', 'Icon=old'));
      refresh.mockClear();

      await syncLauncher(appImage(), options);

      await expect(readFile(desktopFile(), 'utf8')).resolves.toBe(buildDesktopEntry(link()));
      expect(refresh).toHaveBeenCalledOnce();
    });

    it('moves an entry that starts the running AppImage directly to the link', async () => {
      await createAppImage(appImage());
      await enableLauncher(appImage(), options);
      await writeFile(desktopFile(), buildDesktopEntry(appImage()));

      await syncLauncher(appImage(), options);

      await expect(readFile(desktopFile(), 'utf8')).resolves.toBe(buildDesktopEntry(link()));
    });

    it('leaves a link at the path of an entry that started a removed AppImage, as the desktop may keep that path', async () => {
      const old = join(folder, 'old/Tunelle-26.10.6.AppImage');
      await mkdir(join(old, '..'));
      await enableLauncher(old, options);
      await writeFile(desktopFile(), buildDesktopEntry(old));

      await syncLauncher(appImage(), options);

      await expect(readlink(old).then((target) => target.replaceAll('\\', '/'))).resolves.toBe(link());
      await expect(readLauncherTarget(options.dataHome)).resolves.toBe(appImage());
    });

    it('does not point the link to itself', async () => {
      await enableLauncher(appImage(), options);

      await enableLauncher(link(), options);

      await expect(readlink(link()).then((target) => target.replaceAll('\\', '/'))).resolves.toBe(appImage());
    });

    it('restores a link that went missing', async () => {
      await enableLauncher(appImage(), options);
      await rm(link());

      await syncLauncher(appImage(), options);

      await expect(readlink(link()).then((target) => target.replaceAll('\\', '/'))).resolves.toBe(appImage());
    });

    it('rewrites the icons of the running AppImage when they changed', async () => {
      await createAppImage(appImage());
      await enableLauncher(appImage(), options);
      await writeFile(join(folder, 'icons/256x256.png'), 'new icon 256');

      await syncLauncher(appImage(), options);

      await expect(readFile(join(folder, 'data/icons/hicolor/256x256/apps/tunelle.png'), 'utf8')).resolves.toBe('new icon 256');
    });

    it('restores an icon that went missing', async () => {
      await createAppImage(appImage());
      await enableLauncher(appImage(), options);
      await rm(join(folder, 'data/icons/hicolor/16x16/apps/tunelle.png'));

      await syncLauncher(appImage(), options);

      await expect(exists(join(folder, 'data/icons/hicolor/16x16/apps/tunelle.png'))).resolves.toBe(true);
    });

    it('points the entry to the running AppImage when the AppImage was moved', async () => {
      await enableLauncher(join(folder, 'old/Tunelle.AppImage'), options);

      await syncLauncher(appImage(), options);

      await expect(readLauncherTarget(options.dataHome)).resolves.toBe(appImage());
    });

    describe('from the entry of the name eMusic', () => {
      const legacyFiles = () => [
        join(folder, 'data/applications/emusic.desktop'),
        join(folder, 'data/emusic/eMusic.AppImage'),
        ...sizes.map((size) => join(folder, `data/icons/hicolor/${size}x${size}/apps/emusic.png`)),
      ];

      const createLegacyLauncher = async () => {
        await Promise.all(legacyFiles().map((file) => mkdir(join(file, '..'), { recursive: true })));
        await Promise.all(legacyFiles().map((file) => writeFile(file, file.endsWith('.desktop') ? 'Exec="/old/eMusic.AppImage" %U\n' : '')));
      };

      it('replaces it with the entry of the running AppImage, and removes what it left', async () => {
        await createLegacyLauncher();

        await syncLauncher(appImage(), options);

        await expect(readLauncherTarget(options.dataHome)).resolves.toBe(appImage());
        await expect(Promise.all(legacyFiles().map(exists))).resolves.toEqual(legacyFiles().map(() => false));
        await expect(exists(join(folder, 'data/emusic'))).resolves.toBe(false);
        await expect(exists(join(folder, 'data/icons/hicolor/16x16/apps/tunelle.png'))).resolves.toBe(true);
        expect(refresh).toHaveBeenCalled();
      });

      it('removes it and keeps the entry that is there already', async () => {
        const first = join(folder, 'first/Tunelle.AppImage');
        await createAppImage(first);
        await enableLauncher(first, options);
        await createLegacyLauncher();

        await syncLauncher(appImage(), options);

        await expect(readLauncherTarget(options.dataHome)).resolves.toBe(first);
        await expect(exists(legacyFiles()[0])).resolves.toBe(false);
      });

      it('is left alone when the app does not run from an AppImage', async () => {
        await createLegacyLauncher();

        await syncLauncher(undefined, options);

        await expect(exists(legacyFiles()[0])).resolves.toBe(true);
        await expect(isLauncherEnabled(options.dataHome)).resolves.toBe(false);
      });
    });

    it('drops the entry when its AppImage is gone and the app does not run from an AppImage', async () => {
      await enableLauncher(join(folder, 'old/Tunelle.AppImage'), options);

      await syncLauncher(undefined, options);

      await expect(isLauncherEnabled(options.dataHome)).resolves.toBe(false);
      await expect(exists(join(folder, 'data/icons/hicolor/16x16/apps/tunelle.png'))).resolves.toBe(false);
    });
  });
});

describe('launcher offer', () => {
  it('was not made until it is marked, and stays marked', async () => {
    const folder = await createFolder('tunelle-offer-');
    const userData = join(folder, 'userData');

    await expect(wasLauncherOffered(userData)).resolves.toBe(false);
    await markLauncherOffered(userData);
    await markLauncherOffered(userData);

    await expect(wasLauncherOffered(userData)).resolves.toBe(true);
    await rm(folder, { recursive: true, force: true });
  });
});

describe('hasOtherLauncher', () => {
  let dataHome: string;
  const appImage = '/home/me/Apps/Tunelle.AppImage';
  const options = () => ({ dataHome, dataDirs: [join(dataHome, 'system')] });
  const writeSystemEntry = (name: string, content: string) =>
    mkdir(join(dataHome, 'system/applications'), { recursive: true }).then(() => writeFile(join(dataHome, 'system/applications', name), content));
  const writeEntry = (name: string, content: string) =>
    mkdir(join(dataHome, 'applications'), { recursive: true }).then(() => writeFile(join(dataHome, 'applications', name), content));

  beforeEach(async () => {
    dataHome = await createFolder('tunelle-other-launcher-');
  });

  afterEach(() => rm(dataHome, { recursive: true, force: true }));

  it('finds no entry in a menu without an applications folder', async () => {
    expect(await hasOtherLauncher(appImage, options())).toBe(false);
  });

  it('finds the entry of a tool that starts this AppImage', async () => {
    await writeEntry('appimagekit_1234-Tunelle.desktop', `[Desktop Entry]\nName=Tunelle\nExec=${appImage} %U\n`);

    expect(await hasOtherLauncher(appImage, options())).toBe(true);
  });

  it('finds an entry that quotes the path, and one that only has a TryExec of it', async () => {
    await writeEntry('gearlever.desktop', `[Desktop Entry]\nExec="${appImage}" --flag\n`);
    expect(await hasOtherLauncher(appImage, options())).toBe(true);

    await rm(join(dataHome, 'applications/gearlever.desktop'));
    await writeEntry('other.desktop', `[Desktop Entry]\nTryExec=${appImage}\n`);
    expect(await hasOtherLauncher(appImage, options())).toBe(true);
  });

  it('finds the entry AM (portable-linux-apps) writes, in the folder of the user or of all users', async () => {
    const installed = '/opt/tunelle/tunelle';
    const entry = '[Desktop Entry]\nName=Tunelle\nExec=tunelle\nIcon=/opt/tunelle/icons/tunelle\n';

    await writeSystemEntry('tunelle-AM.desktop', entry);
    expect(await hasOtherLauncher(installed, options())).toBe(true);

    await rm(join(dataHome, 'system'), { recursive: true });
    expect(await hasOtherLauncher(installed, options())).toBe(false);

    await writeEntry('tunelle-AM.desktop', entry.replace('/opt/tunelle', '/home/me/.local/am-apps/tunelle'));
    expect(await hasOtherLauncher('/home/me/.local/am-apps/tunelle/tunelle', options())).toBe(true);
  });

  it('does not take an entry of the same command for another AppImage as this one', async () => {
    await writeSystemEntry('tunelle.desktop', '[Desktop Entry]\nExec=Tunelle.AppImage\nIcon=/usr/share/icons/tunelle.png\n');

    expect(await hasOtherLauncher(appImage, options())).toBe(false);
  });

  it('ignores the entries of the app itself, of another AppImage and files that are no entry', async () => {
    await writeEntry('tunelle.desktop', `[Desktop Entry]\nExec="${appImage}" %U\n`);
    await writeEntry('emusic.desktop', `[Desktop Entry]\nExec="${appImage}" %U\n`);
    await writeEntry('Other.desktop', '[Desktop Entry]\nExec=/home/me/Apps/Other.AppImage\n');
    await writeEntry('notes.txt', `Exec=${appImage}`);

    expect(await hasOtherLauncher(appImage, options())).toBe(false);
  });
});
