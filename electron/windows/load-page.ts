import type { BrowserWindow } from 'electron';

/**
 * Loads a page and waits for it. A navigation that interrupts the load (a reload of the development server, the page reloading itself) rejects it with
 * ERR_ABORTED while the next load goes on, which is no reason to stop the start up. See docs/app/startup.md
 */
const loadPage = (window: BrowserWindow, url: string) =>
  window.loadURL(url).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ERR_ABORTED') return;

    throw error;
  });

export default loadPage;
