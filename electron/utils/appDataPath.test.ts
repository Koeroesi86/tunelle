import { describe, expect, it } from 'vitest';
import { resolve } from 'path';
import appDataPath from './appDataPath';

describe('appDataPath', () => {
  it('keeps the folder of the app named after the package', () => {
    expect(appDataPath('/home/u/.config', 'tunelle', false)).toBe(resolve('/home/u/.config/tunelle'));
  });

  it('uses a separate folder for a dev run', () => {
    expect(appDataPath('/home/u/.config', 'tunelle', true)).toBe(resolve('/home/u/.config/tunelle-dev'));
  });

  it('puts the folder in the one that a test run names, whatever the system says', () => {
    expect(appDataPath('/home/u/.config', 'tunelle', false, '/tmp/run')).toBe(resolve('/tmp/run/tunelle'));
  });

  it('ignores a name that is empty', () => {
    expect(appDataPath('/home/u/.config', 'tunelle', false, '')).toBe(resolve('/home/u/.config/tunelle'));
  });
});
