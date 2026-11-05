import type { WebContents } from 'electron';

// URL.origin of a scheme like tunelle: or file: is the string "null" for all of them, so the scheme and the host are compared
const originOf = (url: string) => {
  const { protocol, host } = new URL(url);
  return `${protocol}//${host}`;
};

/** Keep a window on the origin it was loaded from, and refuse to open further windows */
function lockNavigation(webContents: WebContents) {
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-navigate', (event, url) => {
    if (originOf(url) !== originOf(webContents.getURL())) event.preventDefault();
  });
}

export default lockNavigation;
