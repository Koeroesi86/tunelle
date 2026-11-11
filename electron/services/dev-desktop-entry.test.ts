import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs } from '../test-memory-fs';
import { registerDevDesktopEntry, removeDevDesktopEntry } from './dev-desktop-entry';

vi.mock('fs', () => ({ ...memoryFs.sync, default: memoryFs.sync }));

describe('devDesktopEntry', () => {
  const dataHome = '/data';
  const entry = join(dataHome, 'applications/tunelle-dev.desktop');

  beforeEach(() => memoryFs.reset());

  it('registers a hidden entry with the icon of the app', () => {
    registerDevDesktopEntry(dataHome, '/app/icons/png/512x512.png');

    const content = memoryFs.sync.readFileSync(entry, 'utf8');
    expect(content).toContain('Icon=/app/icons/png/512x512.png');
    expect(content).toContain('NoDisplay=true');
  });

  it('removes the entry it registered', () => {
    registerDevDesktopEntry(dataHome, '/app/icon.png');

    removeDevDesktopEntry(dataHome);

    expect(memoryFs.sync.existsSync(entry)).toBe(false);
  });

  it('removes nothing without failing when there is no entry', () => {
    expect(() => removeDevDesktopEntry(dataHome)).not.toThrow();
  });
});
