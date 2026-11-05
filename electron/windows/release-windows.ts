import type { AppWindows } from '@shared/types/global';
import closeSplash from './close-splash';

/**
 * The main window is gone: the splash that waits for it goes with it, or it stays as the only window and the app never quits (the main window is
 * closed, or its page crashes, before it is shown).
 */
const releaseWindows = (windows: AppWindows) => {
  closeSplash(windows);
  windows.main = null;
};

export default releaseWindows;
