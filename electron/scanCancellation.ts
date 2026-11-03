import { isInsideFolder } from './folderAvailability';

const quitting = new AbortController();

/** Aborted when the app quits; a scan stops at the next file and the folders it was scanning are scanned again at the next start */
export const quitSignal: AbortSignal = quitting.signal;

export const cancelScans = () => quitting.abort();

const running = new Map<AbortController, string>();

/** Register a scan of a folder: its signal is aborted by the parent signal or by `cancelScansInside`, and `release` takes the scan off the list when it ends */
export const trackScan = (folderPath: string, parent: AbortSignal = quitSignal) => {
  const removal = new AbortController();
  running.set(removal, folderPath);

  return {
    signal: AbortSignal.any([parent, removal.signal]),
    /** Whether the folder was taken out of the library while it was scanned, as opposed to the app quitting */
    wasRemoved: () => removal.signal.aborted && !parent.aborted,
    release: () => running.delete(removal),
  };
};

/** Stop the scans of a folder, of the folders below it and of the folders it is below, as their tracks are removed from the library with it */
export const cancelScansInside = (folderPath: string) =>
  [...running]
    .filter(([, scanned]) => scanned === folderPath || isInsideFolder(folderPath, scanned) || isInsideFolder(scanned, folderPath))
    .forEach(([removal]) => removal.abort());
