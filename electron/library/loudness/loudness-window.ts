import os from 'os';
import { resolve } from 'path';
import { BrowserWindow, ipcMain } from 'electron';
import type { IpcMainEvent } from 'electron';
import type { MeasureResult } from '@shared/types/loudness';
import lockNavigation from '../../windows/lock-navigation';

/** What a measurement gives: the answer of the page, or why there is none (the window crashed, or did not answer in time) */
export type Measurement = MeasureResult | { outcome: 'crashed' | 'timeout' };

/** The window is made again after this many files, which gives back the memory that decoding took */
const filesPerWindow = 50;
/** A file that takes longer than this has a drive that does not answer; its window is closed, and the file is tried again later */
const measureTimeout = 300_000;
/** The page has this long to load and say it is ready */
const pageTimeout = 30_000;

const outcomes = ['measured', 'silent', 'undecodable', 'unreadable'];

const isMeasureResult = (value: unknown): value is MeasureResult =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'number' &&
  'outcome' in value &&
  outcomes.includes(String(value.outcome));

/** The window runs at a low priority, so the measurement does not slow down what the user is doing; a system that refuses leaves it as it is */
const lowerPriority = (window: BrowserWindow) => {
  try {
    os.setPriority(window.webContents.getOSProcessId(), os.constants.priority.PRIORITY_LOW);
  } catch (error) {
    console.error('Lowering the priority of the loudness window failed', error);
  }
};

interface Pending {
  id: number;
  settle: (measurement: Measurement) => void;
}

/**
 * The hidden window that decodes the files of the library and measures them (client/loudness). One file at a time; the window is made when
 * the first file asks for it and again after a number of files. See docs/app/loudness-measurement.md
 */
export const createLoudnessWindow = (pageUrl: string) => {
  let window: BrowserWindow | undefined;
  let ready: Promise<boolean> | undefined;
  let pending: Pending | undefined;
  let measured = 0;
  let nextId = 1;
  let stopListening = () => {};

  const close = () => {
    stopListening();
    stopListening = () => {};
    window?.destroy();
    window = undefined;
    ready = undefined;
    measured = 0;
    pending?.settle({ outcome: 'timeout' });
    pending = undefined;
  };

  const listen = (created: BrowserWindow, onReady: () => void) => {
    const fromWindow = (event: IpcMainEvent) => event.sender === created.webContents;
    const onWindowReady = (event: IpcMainEvent) => fromWindow(event) && onReady();
    const result = (event: IpcMainEvent, payload: unknown) => {
      if (fromWindow(event) && isMeasureResult(payload) && payload.id === pending?.id) pending.settle(payload);
    };
    ipcMain.on('LOUDNESS_READY', onWindowReady);
    ipcMain.on('LOUDNESS_RESULT', result);
    return () => {
      ipcMain.off('LOUDNESS_READY', onWindowReady);
      ipcMain.off('LOUDNESS_RESULT', result);
    };
  };

  const open = () => {
    const created = new BrowserWindow({
      show: false,
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        disableBlinkFeatures: 'Auxclick',
        preload: resolve(__dirname, '../../loudness-preload.js'),
      },
    });
    window = created;
    lockNavigation(created.webContents);
    created.webContents.on('render-process-gone', () => {
      pending?.settle({ outcome: 'crashed' });
      if (window === created) close();
    });
    ready = new Promise<boolean>((resolveReady) => {
      stopListening = listen(created, () => resolveReady(true));
      setTimeout(() => resolveReady(false), pageTimeout);
    });
    created.loadURL(pageUrl).then(() => lowerPriority(created), console.error);
    return created;
  };

  const ask = (current: BrowserWindow, id: number, path: string) =>
    new Promise<Measurement>((resolveAsk) => {
      const timer = setTimeout(() => resolveAsk({ outcome: 'timeout' }), measureTimeout);
      const settle = (measurement: Measurement) => {
        clearTimeout(timer);
        resolveAsk(measurement);
      };
      pending = { id, settle };
      current.webContents.send('LOUDNESS_MEASURE', { id, path });
    });

  return {
    /** Measure a track of the library; answers with why there is no result when the window crashes or does not answer */
    measure: async (path: string): Promise<Measurement> => {
      if (measured >= filesPerWindow) close();
      const current = window ?? open();
      if (!(await ready)) {
        close();
        return { outcome: 'timeout' };
      }
      measured += 1;

      const result = await ask(current, nextId++, path);
      pending = undefined;
      // a window that crashed or did not answer is not used again
      if (result.outcome === 'timeout' || result.outcome === 'crashed') close();
      return result;
    },
    close,
  };
};
