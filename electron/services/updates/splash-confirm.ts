import { ipcMain } from 'electron';
import type { BrowserWindow, IpcMainEvent } from 'electron';
import { splashAnswerSchema, splashQuestionSchema } from '@shared/schemas/update';
import type { SplashQuestion } from '@shared/schemas/update';

/** Asks on the splash and waits for the answer of its buttons; closing the splash counts as "Not now". See docs/app/updater.md */
export const askOnSplash = (splash: BrowserWindow, question: SplashQuestion) =>
  new Promise<boolean>((resolve) => {
    const finish = (answer: boolean) => {
      ipcMain.off('SPLASH_ANSWER', onAnswer);
      splash.off('closed', onClosed);
      resolve(answer);
    };
    const onAnswer = (event: IpcMainEvent, payload: unknown) => {
      const answer = splashAnswerSchema.safeParse(payload);

      if (event.sender === splash.webContents && answer.success) finish(answer.data.download);
    };
    const onClosed = () => finish(false);

    ipcMain.on('SPLASH_ANSWER', onAnswer);
    splash.once('closed', onClosed);
    splash.webContents.send('SPLASH_QUESTION', splashQuestionSchema.parse(question));
  });
