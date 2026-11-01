import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { getAppUserModelId, installerAppId, setsAppUserModelId } from './appUserModelId';

describe('getAppUserModelId', () => {
  it('is the installer app ID for a packaged app', () => {
    expect(getAppUserModelId(false, 'production')).toBe('io.github.koeroesi86.Tunelle');
  });

  it('differs from the installer app ID in development', () => {
    expect(getAppUserModelId(true, 'development')).toBe('io.github.koeroesi86.Tunelle-development');
  });

  it('matches the appId the installer is built with', () => {
    const { build } = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));

    expect(installerAppId).toBe(build.appId);
  });
});

describe('setsAppUserModelId', () => {
  it('sets the ID of the installer on Windows', () => {
    expect(setsAppUserModelId('win32', false)).toBe(true);
    expect(setsAppUserModelId('win32', undefined)).toBe(true);
  });

  it('leaves the ID of a Store package alone', () => {
    expect(setsAppUserModelId('win32', true)).toBe(false);
  });

  it('sets nothing on other systems', () => {
    expect(setsAppUserModelId('linux', false)).toBe(false);
    expect(setsAppUserModelId('darwin', false)).toBe(false);
  });
});
