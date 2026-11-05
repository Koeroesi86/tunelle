import type { WebContents } from 'electron';

/** The window can be closed while the database or the network answers, and sending to a closed one throws */
export const sendIfAlive = (sender: WebContents, channel: string, payload?: unknown) => {
  if (!sender.isDestroyed()) sender.send(channel, payload);
};
