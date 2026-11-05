import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerDevDesktopEntry, removeDevDesktopEntry } from './devDesktopEntry';

describe('devDesktopEntry', () => {
  let dataHome = '';
  const entry = () => join(dataHome, 'applications/tunelle-dev.desktop');

  beforeEach(() => {
    dataHome = mkdtempSync(join(tmpdir(), 'dev-entry-'));
  });

  afterEach(() => rmSync(dataHome, { recursive: true, force: true }));

  it('registers a hidden entry with the icon of the app', () => {
    registerDevDesktopEntry(dataHome, '/app/icons/png/512x512.png');

    const content = readFileSync(entry(), 'utf8');
    expect(content).toContain('Icon=/app/icons/png/512x512.png');
    expect(content).toContain('NoDisplay=true');
  });

  it('removes the entry it registered', () => {
    registerDevDesktopEntry(dataHome, '/app/icon.png');

    removeDevDesktopEntry(dataHome);

    expect(existsSync(entry())).toBe(false);
  });

  it('removes nothing without failing when there is no entry', () => {
    expect(() => removeDevDesktopEntry(dataHome)).not.toThrow();
  });
});
