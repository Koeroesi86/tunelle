import type { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import loadPage from './load-page';

const windowThatRejects = (error: unknown) => ({ loadURL: vi.fn().mockRejectedValue(error) }) as unknown as BrowserWindow;

describe('loadPage', () => {
  it('loads the url', async () => {
    const loadURL = vi.fn().mockResolvedValue(undefined);

    await loadPage({ loadURL } as unknown as BrowserWindow, 'tunelle://app/index.html');

    expect(loadURL).toHaveBeenCalledExactlyOnceWith('tunelle://app/index.html');
  });

  it('goes on when another navigation interrupted the load', async () => {
    const aborted = Object.assign(new Error("ERR_ABORTED (-3) loading 'tunelle://app/index.html'"), { code: 'ERR_ABORTED', errno: -3 });

    await expect(loadPage(windowThatRejects(aborted), 'tunelle://app/index.html')).resolves.toBeUndefined();
  });

  it.each([
    ['a page that does not exist', Object.assign(new Error('ERR_FILE_NOT_FOUND (-6)'), { code: 'ERR_FILE_NOT_FOUND' })],
    ['an error without a code', new Error('boom')],
  ])('still fails for %s', async (_name, error) => {
    await expect(loadPage(windowThatRejects(error), 'tunelle://app/index.html')).rejects.toBe(error);
  });
});
