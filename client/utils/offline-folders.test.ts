import { describe, expect, it } from 'vitest';
import { isOffline } from './offline-folders';

describe('isOffline', () => {
  it('finds a file below an offline folder', () => {
    expect(isOffline('/mnt/usb/album/one.flac', ['/mnt/usb'])).toBe(true);
    expect(isOffline('/mnt/usb/album/one.flac', ['/mnt/usb/'])).toBe(true);
    expect(isOffline('C:\\music\\one.flac', ['C:\\music'])).toBe(true);
  });

  it('does not take a folder with the same beginning for the offline one', () => {
    expect(isOffline('/mnt/usb2/one.flac', ['/mnt/usb'])).toBe(false);
  });

  it('is false without offline folders', () => {
    expect(isOffline('/mnt/usb/one.flac', [])).toBe(false);
  });
});
