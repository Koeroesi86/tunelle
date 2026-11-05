import type { AppWindows } from '@shared/types/global';

export const getMainWindow = (windows: AppWindows) => {
  if (!windows.main) throw new Error('Main window is not available');
  return windows.main;
};
