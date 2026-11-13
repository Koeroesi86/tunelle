import type { WebContents } from 'electron';
import { onPowerSavingChange, savingPower } from './power-state';
import { sendIfAlive } from '../utils/send-if-alive';

/** Tells the window whether the background work is lowered, now and with every change, until the window is gone */
export const sendPowerSaving = (sender: WebContents) => {
  const send = (saving: boolean) => sendIfAlive(sender, 'POWER_SAVING', { saving });
  const stop = onPowerSavingChange(send);
  sender.once('destroyed', stop);
  send(savingPower());
};
