import { ipcMain } from 'electron';
import type { ListenerContext } from './listener-context';
import { setPlaying } from '../library/loudness/playback-state';
import { clearTrackLoudness } from '../repositories/loudness-repository';
import { logError } from '../utils/log-error';
import { sendIfAlive } from '../utils/send-if-alive';

const registerLoudnessListeners = ({ database, loudness }: ListenerContext) => {
  ipcMain.on('PLAYBACK_STATE', (_event, payload: unknown) => {
    setPlaying(typeof payload === 'object' && payload !== null && 'isPlaying' in payload && payload.isPlaying === true);
  });

  // the settings ask how far the measurement is when they open, and are told on their own while it goes on (see loudness-source.ts)
  ipcMain.on('LOUDNESS_STATUS_LOAD', (event) => {
    loudness
      .status()
      .then((status) => sendIfAlive(event.sender, 'LOUDNESS_STATUS', status))
      .catch(logError);
  });

  ipcMain.on('LOUDNESS_CLEAR', () => {
    clearTrackLoudness(database).then(loudness.restart).catch(logError);
  });
};

export default registerLoudnessListeners;
