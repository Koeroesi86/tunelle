import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { BrowserWindow, Notification } from 'electron';
import { recordLibraryChange } from './library-changes';
import { backgroundQueue } from '../tasks/background-queue';
import { getSettings } from '../../repositories/settings-repository';

const notifications: { options: { title: string; body: string }; show: ReturnType<typeof vi.fn>; click?: () => void }[] = [];

vi.mock('electron', () => {
  class FakeNotification {
    static isSupported = vi.fn();
    show = vi.fn();
    click: (() => void) | undefined;
    constructor(public options: { title: string; body: string }) {
      notifications.push(this);
    }
    on(event: string, listener: () => void) {
      if (event === 'click') this.click = listener;
    }
  }
  return { Notification: FakeNotification, BrowserWindow: { fromWebContents: vi.fn() }, app: { getLocale: () => 'en-US' } };
});
vi.mock('../../repositories/settings-repository', () => ({ getSettings: vi.fn() }));
vi.mock('../tasks/background-queue', () => ({ scanKind: 'scan', backgroundQueue: { isBusy: vi.fn() } }));

const quiet = 10_000;
const sender = {} as WebContents;

describe('recordLibraryChange', () => {
  const window = { isDestroyed: () => false, isFocused: vi.fn(), isMinimized: vi.fn(), restore: vi.fn(), show: vi.fn(), focus: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    notifications.length = 0;
    global._database = {} as never;
    vi.mocked(Notification.isSupported).mockReturnValue(true);
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(window as never);
    vi.mocked(backgroundQueue.isBusy).mockReturnValue(false);
    vi.mocked(getSettings).mockResolvedValue({});
    window.isFocused.mockReturnValue(false);
    window.isMinimized.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    global._database = undefined;
  });

  it('tells what was added and removed in one notification once nothing changed for a while', async () => {
    recordLibraryChange(sender, { added: 42 });
    recordLibraryChange(sender, { removed: 3 });
    await vi.advanceTimersByTimeAsync(quiet - 1);
    expect(notifications).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);

    expect(notifications).toHaveLength(1);
    expect(notifications[0].options).toEqual({ title: 'Tunelle', body: 'Library updated: 42 tracks added, 3 removed' });
    expect(notifications[0].show).toHaveBeenCalledOnce();
  });

  it('merges a burst into one notification and counts a single track in the singular', async () => {
    recordLibraryChange(sender, { added: 1 });
    await vi.advanceTimersByTimeAsync(quiet - 1);
    recordLibraryChange(sender, { updated: 2 });
    await vi.advanceTimersByTimeAsync(quiet);

    expect(notifications.map((notification) => notification.options.body)).toEqual(['Library updated: 1 track added, 2 tracks updated']);
  });

  it('sends nothing when nothing changed', async () => {
    recordLibraryChange(sender, {});
    recordLibraryChange(sender, { added: 0, removed: 0 });
    await vi.advanceTimersByTimeAsync(quiet * 2);

    expect(notifications).toHaveLength(0);
  });

  it('waits for the scan that goes on', async () => {
    vi.mocked(backgroundQueue.isBusy).mockReturnValue(true);
    recordLibraryChange(sender, { added: 5 });
    await vi.advanceTimersByTimeAsync(quiet * 3);
    expect(notifications).toHaveLength(0);

    vi.mocked(backgroundQueue.isBusy).mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(quiet);

    expect(notifications).toHaveLength(1);
  });

  it('sends nothing while the window is in front, and does not keep the changes for later', async () => {
    window.isFocused.mockReturnValue(true);
    recordLibraryChange(sender, { added: 5 });
    await vi.advanceTimersByTimeAsync(quiet);
    window.isFocused.mockReturnValue(false);
    recordLibraryChange(sender, { removed: 1 });
    await vi.advanceTimersByTimeAsync(quiet);

    expect(notifications.map((notification) => notification.options.body)).toEqual(['Library updated: 1 removed']);
  });

  it('sends nothing when the setting is off, and when notifications are not supported', async () => {
    vi.mocked(getSettings).mockResolvedValue({ notifyLibraryChanges: false });
    recordLibraryChange(sender, { added: 5 });
    await vi.advanceTimersByTimeAsync(quiet);
    vi.mocked(getSettings).mockResolvedValue({});
    vi.mocked(Notification.isSupported).mockReturnValue(false);
    recordLibraryChange(sender, { added: 5 });
    await vi.advanceTimersByTimeAsync(quiet);

    expect(notifications).toHaveLength(0);
  });

  it('shows the window, restored when it was minimized, when the notification is clicked', async () => {
    window.isMinimized.mockReturnValue(true);
    recordLibraryChange(sender, { added: 1 });
    await vi.advanceTimersByTimeAsync(quiet);

    notifications[0].click?.();

    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
  });
});
