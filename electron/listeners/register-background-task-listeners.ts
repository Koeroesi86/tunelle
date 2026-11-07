import { ipcMain } from 'electron';
import { backgroundTaskSchema } from '@shared/schemas/background-tasks';
import type { BackgroundTask } from '@shared/schemas/background-tasks';
import type { ListenerContext } from './listener-context';
import { backgroundQueue } from '../library/tasks/background-queue';
import { sendIfAlive } from '../utils/send-if-alive';

/** The window is told about a change at most this often, as a scan starts and ends tasks in quick succession */
const reportPause = 250;

const isShown = (entry: { kind: string; running: boolean; waiting: number }): entry is BackgroundTask => backgroundTaskSchema.safeParse(entry).success;

const registerBackgroundTaskListeners = ({ windows }: ListenerContext) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let told: string | undefined;

  const tell = (force: boolean) => {
    timer = undefined;
    const tasks = backgroundQueue.snapshot().filter(isShown);
    const sent = JSON.stringify(tasks);
    if (!windows.main || (sent === told && !force)) return;

    told = sent;
    sendIfAlive(windows.main.webContents, 'BACKGROUND_TASKS', { tasks });
  };

  // the window asks when it opens, and is told on its own when the queue changes. See docs/app/task-queue.md
  ipcMain.on('BACKGROUND_TASKS_LOAD', () => tell(true));
  backgroundQueue.onChange(() => {
    timer ??= setTimeout(() => tell(false), reportPause);
  });
};

export default registerBackgroundTaskListeners;
