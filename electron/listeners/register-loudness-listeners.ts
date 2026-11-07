import { ipcMain } from 'electron';
import type { ListenerContext } from './listener-context';
import { prioritiseLoudnessSchema } from '@shared/schemas/requests';
import { clearTrackLoudness } from '../repositories/loudness-repository';
import { logError } from '../utils/log-error';
import { parsePayload } from '../utils/parse-payload';
import { sendIfAlive } from '../utils/send-if-alive';

const registerLoudnessListeners = ({ database, loudness }: ListenerContext) => {
  // the settings ask how far the measurement is when they open, and are told on their own while it goes on (see loudness-source.ts)
  ipcMain.on('LOUDNESS_STATUS_LOAD', (event) => {
    loudness
      .status()
      .then((status) => sendIfAlive(event.sender, 'LOUDNESS_STATUS', status))
      .catch(logError);
  });

  // the tracks that were queued or started are measured before the rest of the library
  ipcMain.on('LOUDNESS_PRIORITISE', (_event, payload: unknown) => {
    const request = parsePayload(prioritiseLoudnessSchema, payload);
    if (request) loudness.prioritise(request.paths).catch(logError);
  });

  ipcMain.on('LOUDNESS_CLEAR', () => {
    clearTrackLoudness(database).then(loudness.restart).catch(logError);
  });
};

export default registerLoudnessListeners;
