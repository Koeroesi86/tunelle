import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListenerContext } from './listener-context';
import registerBackgroundTaskListeners from './register-background-task-listeners';
import { backgroundQueue } from '../library/tasks/background-queue';

const listeners = new Map<string, () => void>();

vi.mock('electron', () => ({ ipcMain: { on: (channel: string, listener: () => void) => listeners.set(channel, listener) } }));
vi.mock('../library/tasks/background-queue', () => ({ backgroundQueue: { snapshot: vi.fn(), onChange: vi.fn() } }));

describe('registerBackgroundTaskListeners', () => {
  const send = vi.fn();
  let changed: () => void;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    listeners.clear();
    send.mockReset();
    vi.mocked(backgroundQueue.snapshot)
      .mockReset()
      .mockReturnValue([{ kind: 'scan', running: true, waiting: 0 }]);
    vi.mocked(backgroundQueue.onChange)
      .mockReset()
      .mockImplementation((listener) => {
        changed = listener;
        return () => true;
      });
    registerBackgroundTaskListeners({ windows: { main: { webContents: { send, isDestroyed: () => false } } } } as unknown as ListenerContext);
  });

  afterEach(() => vi.useRealTimers());

  it('tells the window the state when it asks', () => {
    listeners.get('BACKGROUND_TASKS_LOAD')?.();

    expect(send).toHaveBeenCalledWith('BACKGROUND_TASKS', { tasks: [{ kind: 'scan', running: true, waiting: 0 }] });
  });

  it('tells a change once for the changes of a moment, and leaves out the kinds the window does not name', async () => {
    vi.mocked(backgroundQueue.snapshot).mockReturnValue([
      { kind: 'scan', running: true, waiting: 1 },
      { kind: 'other', running: true, waiting: 0 },
    ]);
    changed();
    changed();
    await vi.advanceTimersByTimeAsync(250);

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith('BACKGROUND_TASKS', { tasks: [{ kind: 'scan', running: true, waiting: 1 }] });
  });

  it('does not tell what the window knows already', async () => {
    changed();
    await vi.advanceTimersByTimeAsync(250);
    changed();
    await vi.advanceTimersByTimeAsync(250);

    expect(send).toHaveBeenCalledOnce();
  });
});
