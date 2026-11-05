import type { Database } from 'sqlite3';
import type { BrowserWindow } from 'electron';

export interface ElectronApi {
  send: (channel: string, payload?: unknown) => void;
  on: <T = unknown>(channel: string, listener: (payload: T) => void) => void;
  getPathForFile: (file: File) => string;
  /** Something blurs behind the translucent parts of the window (see windowBackdrop.ts) */
  blurred: boolean;
}

export interface AppWindows {
  main: BrowserWindow | null;
  loading: BrowserWindow | null;
}

declare global {
  interface Window {
    electronAPI: ElectronApi;
  }

  // main process state shared between modules
  var _appDataPath: string;
  var _appId: string;
  var _database: Database | undefined;
}
