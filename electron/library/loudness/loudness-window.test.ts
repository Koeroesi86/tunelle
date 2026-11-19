import os from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLoudnessWindow } from './loudness-window';

type Handler = (event: { sender: unknown }, payload?: unknown) => void;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Set<(event: { sender: unknown }, payload?: unknown) => void>>(),
  windows: [] as {
    webContents: { send: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn>; getOSProcessId: () => number };
    destroy: ReturnType<typeof vi.fn>;
    loadURL: ReturnType<typeof vi.fn>;
  }[],
  loadURL: undefined as undefined | (() => Promise<void>),
}));

vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, handler: Handler) => mocks.handlers.set(channel, (mocks.handlers.get(channel) ?? new Set()).add(handler)),
    off: (channel: string, handler: Handler) => mocks.handlers.get(channel)?.delete(handler),
  },
  BrowserWindow: class {
    webContents = { send: vi.fn(), on: vi.fn(), getOSProcessId: () => 123 };
    destroy = vi.fn();
    loadURL = vi.fn(() => (mocks.loadURL ?? (async () => undefined))());
    constructor() {
      mocks.windows.push(this);
    }
  },
}));
vi.mock('../../windows/lock-navigation', () => ({ default: vi.fn() }));

const emit = (channel: string, window: (typeof mocks.windows)[number], payload?: unknown) =>
  mocks.handlers.get(channel)?.forEach((handler) => handler({ sender: window.webContents }, payload));
const measuredResult = (id: number) => ({
  id,
  outcome: 'measured',
  analysis: { v: 1, sampleRate: 44100, channels: 2, integratedLufs: -14, loudnessRange: 5, samplePeak: 0.5, shortTerm: [], histogram: { bin: 1, counts: {} } },
  trackGain: -3,
  trackPeak: 0.5,
});
const silent = (id: number) => ({ id, outcome: 'silent' });

describe('the loudness window', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.handlers.clear();
    mocks.windows.length = 0;
    mocks.loadURL = undefined;
  });

  afterEach(() => vi.useRealTimers());

  /** Starts a measurement and lets the page say it is ready */
  const start = async (loudness: ReturnType<typeof createLoudnessWindow>, path = '/m/a.flac') => {
    const result = loudness.measure(path, 60);
    const window = mocks.windows.at(-1);
    if (!window) throw new Error('no window');
    emit('LOUDNESS_READY', window);
    await vi.advanceTimersByTimeAsync(0);
    return { result, window };
  };

  it('opens a hidden window for the first file, asks it to measure, and answers with what it says', async () => {
    const loudness = createLoudnessWindow('tunelle://app/loudness.html');
    const { result, window } = await start(loudness);

    expect(window.loadURL).toHaveBeenCalledWith('tunelle://app/loudness.html');
    expect(window.webContents.send).toHaveBeenCalledWith('LOUDNESS_MEASURE', { id: 1, path: '/m/a.flac', duration: 60 });
    emit('LOUDNESS_RESULT', window, measuredResult(1));

    expect(await result).toMatchObject({ outcome: 'measured', trackGain: -3 });
  });

  it('keeps the window for the next file, and takes only the answers of its own window and its own file', async () => {
    const loudness = createLoudnessWindow('page');
    const first = await start(loudness);
    emit('LOUDNESS_RESULT', first.window, silent(1));
    await first.result;

    const second = loudness.measure('/m/b.flac');
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.windows).toHaveLength(1);

    emit('LOUDNESS_RESULT', first.window, silent(1));
    emit('LOUDNESS_RESULT', { webContents: {} } as never, silent(2));
    emit('LOUDNESS_RESULT', first.window, { nonsense: true });
    emit('LOUDNESS_RESULT', first.window, silent(2));

    expect(await second).toEqual({ id: 2, outcome: 'silent' });
  });

  it('says the window is not available when the page does not get ready in time, and opens another for the next file', async () => {
    const loudness = createLoudnessWindow('page');
    const result = loudness.measure('/m/a.flac');
    await vi.advanceTimersByTimeAsync(30_000);

    expect(await result).toEqual({ outcome: 'unavailable' });
    expect(mocks.windows[0].destroy).toHaveBeenCalled();

    const next = await start(loudness);
    expect(mocks.windows).toHaveLength(2);
    emit('LOUDNESS_RESULT', next.window, silent(1));
    await next.result;
  });

  it('gives up on a file that makes no progress for five minutes, and closes the window', async () => {
    const loudness = createLoudnessWindow('page');
    const { result, window } = await start(loudness);

    await vi.advanceTimersByTimeAsync(299_000);
    emit('LOUDNESS_PROGRESS', window, 1);
    await vi.advanceTimersByTimeAsync(299_000);
    emit('LOUDNESS_PROGRESS', window, 99);
    emit('LOUDNESS_PROGRESS', { webContents: {} } as never, 1);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(await result).toEqual({ outcome: 'timeout' });
    expect(window.destroy).toHaveBeenCalled();
    expect(mocks.handlers.get('LOUDNESS_RESULT')?.size).toBe(0);
  });

  it('answers crashed when the page crashes, and does not use that window again', async () => {
    const loudness = createLoudnessWindow('page');
    const { result, window } = await start(loudness);

    window.webContents.on.mock.calls.find(([name]) => name === 'render-process-gone')?.[1]();

    expect(await result).toEqual({ outcome: 'crashed' });
    expect(window.destroy).toHaveBeenCalled();
  });

  it('makes a new window after fifty files', async () => {
    const loudness = createLoudnessWindow('page');
    const first = await start(loudness);
    emit('LOUDNESS_RESULT', first.window, silent(1));
    await first.result;

    for (let id = 2; id <= 50; id += 1) {
      const next = loudness.measure(`/m/${id}.flac`);
      await vi.advanceTimersByTimeAsync(0);
      emit('LOUDNESS_RESULT', first.window, silent(id));
      await next;
    }
    expect(mocks.windows).toHaveLength(1);

    const fresh = await start(loudness, '/m/51.flac');
    expect(mocks.windows).toHaveLength(2);
    expect(first.window.destroy).toHaveBeenCalled();
    emit('LOUDNESS_RESULT', fresh.window, silent(51));
    await fresh.result;
  });

  it('lowers the priority of the window, and goes on when the system refuses; logs a page that does not load', async () => {
    const setPriority = vi.spyOn(os, 'setPriority').mockImplementation(() => undefined);
    const loudness = createLoudnessWindow('page');
    const first = await start(loudness);
    expect(setPriority).toHaveBeenCalledWith(123, os.constants.priority.PRIORITY_LOW);
    emit('LOUDNESS_RESULT', first.window, silent(1));
    await first.result;
    loudness.close();

    setPriority.mockImplementation(() => {
      throw new Error('EPERM');
    });
    await start(loudness);
    expect(console.error).toHaveBeenCalledWith('Lowering the priority of the loudness window failed', expect.any(Error));
    loudness.close();

    mocks.loadURL = async () => {
      throw new Error('load failed');
    };
    await start(loudness);
    expect(console.error).toHaveBeenCalledWith(expect.any(Error));
  });

  it('closes without a window, and settles a file that waits when it is closed', async () => {
    const loudness = createLoudnessWindow('page');
    expect(() => loudness.close()).not.toThrow();

    const { result } = await start(loudness);
    loudness.close();

    expect(await result).toEqual({ outcome: 'timeout' });
  });
});
