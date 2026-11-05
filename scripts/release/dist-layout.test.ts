import { describe, expect, it } from 'vitest';
import { buildsAppImage, linuxBuilds, packagedExecutable, resourcesFolder, storePackage, updateMetadata } from './dist-layout';

describe('packagedExecutable', () => {
  it.each([
    ['linux', 'x64', 'dist/linux-unpacked/Tunelle'],
    ['linux', 'arm64', 'dist/linux-arm64-unpacked/Tunelle'],
    ['darwin', 'x64', 'dist/mac/Tunelle.app/Contents/MacOS/Tunelle'],
    ['darwin', 'arm64', 'dist/mac-arm64/Tunelle.app/Contents/MacOS/Tunelle'],
    ['win32', 'x64', 'dist/win-unpacked/Tunelle.exe'],
    ['win32', 'arm64', 'dist/win-arm64-unpacked/Tunelle.exe'],
  ])('finds the app of %s %s', (platform, arch, expected) => {
    expect(packagedExecutable(platform, arch)).toBe(expected);
  });
});

describe('resourcesFolder', () => {
  it.each([
    ['linux', 'arm64', 'dist/linux-arm64-unpacked/resources'],
    ['darwin', 'arm64', 'dist/mac-arm64/Tunelle.app/Contents/Resources'],
    ['win32', 'x64', 'dist/win-unpacked/resources'],
  ])('finds the resources of %s %s', (platform, arch, expected) => {
    expect(resourcesFolder(platform, arch)).toBe(expected);
  });
});

describe('updateMetadata', () => {
  it.each([
    ['linux', 'x64', 'dist/latest-linux.yml'],
    ['linux', 'arm64', 'dist/latest-linux-arm64.yml'],
    ['darwin', 'arm64', 'dist/latest-mac.yml'],
    ['win32', 'arm64', 'dist/latest.yml'],
  ])('names the update file of %s %s', (platform, arch, expected) => {
    expect(updateMetadata(platform, arch)[0]).toBe(expected);
  });
});

describe('storePackage', () => {
  it.each([
    ['x64', 'Tunelle-26.11.7-x64.appx', true],
    ['arm64', 'Tunelle-26.11.7-arm64.appx', true],
    ['x64', 'Tunelle-26.11.7-arm64.appx', false],
    ['x64', 'Tunelle 26.11.7.appx', false],
    ['x64', 'Tunelle-Setup-26.11.7-x64.exe', false],
  ])('for %s the name %s is %s', (arch, name, expected) => {
    expect(storePackage('win32', arch)?.test(name)).toBe(expected);
  });

  it('is only for windows', () => {
    expect(storePackage('linux', 'x64')).toBeUndefined();
    expect(storePackage('darwin', 'arm64')).toBeUndefined();
  });
});

describe('linuxBuilds', () => {
  it('builds the AppImage from the targets of package.json and the Flatpak without publishing', () => {
    expect(linuxBuilds('')).toEqual([{ linux: [] }, { linux: ['flatpak'], config: { publish: null } }]);
    expect(linuxBuilds(undefined)).toHaveLength(2);
  });

  it('builds only the package of the job', () => {
    expect(linuxBuilds('appimage')).toEqual([{ linux: [] }]);
    expect(linuxBuilds('flatpak')).toEqual([{ linux: ['flatpak'], config: { publish: null } }]);
  });
});

describe('buildsAppImage', () => {
  it.each([
    ['', true],
    [undefined, true],
    ['appimage', true],
    ['flatpak', false],
  ])('says whether the job %j builds the AppImage', (linuxPackage, builds) => {
    expect(buildsAppImage(linuxPackage)).toBe(builds);
  });
});
