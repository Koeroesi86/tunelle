import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs } from '../test-memory-fs';
import { getTransparencyArguments, isWindowTransparent, saveDesktopBlur, transparentArgument } from './window-transparency';

vi.mock('fs', () => ({ ...memoryFs.sync, default: memoryFs.sync }));

describe('window transparency', () => {
  const appData = '/data';

  beforeEach(() => {
    memoryFs.reset();
    memoryFs.sync.mkdirSync(appData);
  });

  it('is opaque where nothing is saved and the system does not blur', () => {
    expect(isWindowTransparent(false, appData)).toBe(false);
  });

  it('is transparent where the system blurs it', () => {
    expect(isWindowTransparent(true, appData)).toBe(true);
  });

  it('is transparent once the translucent panels are saved, and opaque again when they are turned off', () => {
    saveDesktopBlur(appData, { desktopBlur: true });
    expect(isWindowTransparent(false, appData)).toBe(true);

    saveDesktopBlur(appData, { desktopBlur: false });
    expect(isWindowTransparent(false, appData)).toBe(false);
  });

  it.each([[{}], [null], [{ desktopBlur: 'yes' }]])('is opaque for the settings %j', (settings) => {
    saveDesktopBlur(appData, settings);

    expect(isWindowTransparent(false, appData)).toBe(false);
  });

  it('tells the page only about a transparent window', () => {
    expect(getTransparencyArguments(true)).toEqual([transparentArgument]);
    expect(getTransparencyArguments(false)).toEqual([]);
  });
});
