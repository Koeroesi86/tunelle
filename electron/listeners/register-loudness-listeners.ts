import { ipcMain } from 'electron';
import { setPlaying } from '../library/loudness/playback-state';

const registerLoudnessListeners = () => {
  ipcMain.on('PLAYBACK_STATE', (_event, payload: unknown) => {
    setPlaying(typeof payload === 'object' && payload !== null && 'isPlaying' in payload && payload.isPlaying === true);
  });
};

export default registerLoudnessListeners;
