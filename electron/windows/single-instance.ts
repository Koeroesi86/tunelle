import type { App, BrowserWindow } from 'electron';

type SingleInstanceApp = Pick<App, 'requestSingleInstanceLock' | 'on'>;
type FocusableWindow = Pick<BrowserWindow, 'isMinimized' | 'restore' | 'show' | 'focus'>;

/** A second start (the launcher, a notification of the system) brings the window of the running one forward; while the app is still loading that is the splash */
export const focusWindow = (window: FocusableWindow | null | undefined) => {
  if (!window) return;

  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
};

/** Takes the lock of the profile: the first start keeps it and answers the later ones, a later start leaves at once */
export const holdSingleInstance = (app: SingleInstanceApp, getWindow: () => FocusableWindow | null | undefined, exit: (code: number) => void) => {
  if (!app.requestSingleInstanceLock()) {
    exit(0);
    return;
  }

  app.on('second-instance', () => focusWindow(getWindow()));
};
