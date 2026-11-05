import type { AppWindows } from '@shared/types/global';

/**
 * Takes the splash down. It is destroyed, not closed: a close of a transparent window with vibrancy can stay pending on macOS, and the splash
 * left as the last window keeps the app from quitting. The splash may be gone already, closed by itself.
 */
const closeSplash = (windows: AppWindows) => {
  if (windows.loading && !windows.loading.isDestroyed()) windows.loading.destroy();
  windows.loading = null;
};

export default closeSplash;
