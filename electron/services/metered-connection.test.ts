import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'child_process';
import { isMeteredConnection } from './metered-connection';

vi.mock('child_process', () => ({ execFile: vi.fn() }));

type Callback = (error: Error | null, result?: { stdout: string; stderr: string }) => void;

const answer = (stdout: string) =>
  vi
    .mocked(execFile)
    .mockImplementation(((_file: string, _args: string[], _options: object, callback: Callback) => callback(null, { stdout, stderr: '' })) as never);
const fail = () =>
  vi.mocked(execFile).mockImplementation(((_file: string, _args: string[], _options: object, callback: Callback) => callback(new Error('not found'))) as never);
const onPlatform = (platform: NodeJS.Platform) => vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);

describe('isMeteredConnection', () => {
  beforeEach(() => {
    vi.stubEnv('TUNELLE_METERED', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.mocked(execFile).mockReset();
  });

  describe('on Linux', () => {
    beforeEach(() => {
      onPlatform('linux');
    });

    it.each([
      ['u 1', true],
      ['u 3', true],
      ['u 0', false],
      ['u 2', false],
      ['u 4', false],
      ['', false],
      ['something else', false],
    ])('reads %j from NetworkManager as metered: %s', async (output, metered) => {
      answer(`${output}\n`);

      await expect(isMeteredConnection()).resolves.toBe(metered);
      expect(execFile).toHaveBeenCalledWith(
        'busctl',
        ['get-property', 'org.freedesktop.NetworkManager', '/org/freedesktop/NetworkManager', 'org.freedesktop.NetworkManager', 'Metered'],
        expect.objectContaining({ timeout: 3000 }),
        expect.any(Function)
      );
    });

    it('counts a missing busctl, a missing NetworkManager or a timeout as not metered', async () => {
      fail();

      await expect(isMeteredConnection()).resolves.toBe(false);
    });
  });

  describe('on Windows', () => {
    beforeEach(() => {
      onPlatform('win32');
    });

    it.each([
      ['Fixed', true],
      ['Variable', true],
      ['Unrestricted', false],
      ['Unknown', false],
      ['', false],
    ])('reads the cost %j as metered: %s', async (cost, metered) => {
      answer(`${cost}\r\n`);

      await expect(isMeteredConnection()).resolves.toBe(metered);
      expect(execFile).toHaveBeenCalledWith(
        'powershell.exe',
        expect.arrayContaining(['-NoProfile']),
        expect.objectContaining({ timeout: 3000 }),
        expect.any(Function)
      );
    });

    it('counts a failed PowerShell call, as without a connection, as not metered', async () => {
      fail();

      await expect(isMeteredConnection()).resolves.toBe(false);
    });
  });

  it('counts macOS as not metered without asking the system', async () => {
    onPlatform('darwin');

    await expect(isMeteredConnection()).resolves.toBe(false);
    expect(execFile).not.toHaveBeenCalled();
  });

  it('can be set metered for a test run or a hotspot the system does not know', async () => {
    onPlatform('darwin');
    vi.stubEnv('TUNELLE_METERED', '1');

    await expect(isMeteredConnection()).resolves.toBe(true);
  });
});
