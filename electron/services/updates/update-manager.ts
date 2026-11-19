import { errorMessage } from '@shared/utils/error-message';
import { checkForUpdate, downloadUpdate, installUpdate } from './updater';
import { isMeteredConnection } from './metered-connection';
import type { UpdateSource } from './updater';
import type { UpdateState, UpdateStatus } from '@shared/types/update';

interface UpdateManagerOptions {
  /** Undefined where the app does not update itself */
  source: UpdateSource | undefined;
  info: Pick<UpdateState, 'version' | 'electron' | 'chrome' | 'unavailable'>;
  /** Called with every new state, so the settings can show it */
  publish: (state: UpdateState) => void;
  /** Whether the update at start is on, true unless the user turned it off */
  automatic?: boolean;
  /** Keeps the choice for the next start */
  saveAutomatic?: (automatic: boolean) => Promise<unknown>;
  /** Whether the update downloads on a metered connection without asking, false unless the user allowed it */
  allowMetered?: boolean;
  saveAllowMetered?: (allowMetered: boolean) => Promise<unknown>;
  checkTimeout?: number;
  downloadStallTimeout?: number;
}

export interface UpdateManager {
  getState: () => UpdateState;
  /** Checks for an update and downloads it in the background; on a metered connection it waits for `confirmMetered`; does nothing while a check runs or an update is downloaded */
  check: () => Promise<void>;
  /** The user agreed to use a metered connection: the check and the download go on */
  confirmMetered: () => Promise<void>;
  /** The user did not agree: nothing is checked or downloaded */
  cancelMetered: () => void;
  /** Turns the update at start on or off and keeps the choice; does nothing where the app does not update itself */
  setAutomatic: (automatic: boolean) => Promise<void>;
  /** Turns the download on a metered connection without asking on or off and keeps the choice; does nothing where the app does not update itself */
  setAllowMetered: (allowMetered: boolean) => Promise<void>;
  /** Restarts into the downloaded update; does nothing before one is downloaded */
  install: () => void;
}

/** The manual update flow of the settings: check, download in the background, and install only when the user asks to restart */
export const createUpdateManager = ({
  source,
  info,
  publish,
  automatic: initialAutomatic = true,
  saveAutomatic = () => Promise.resolve(),
  allowMetered: initialAllowMetered = false,
  saveAllowMetered = () => Promise.resolve(),
  checkTimeout,
  downloadStallTimeout,
}: UpdateManagerOptions): UpdateManager => {
  let status: UpdateStatus = { kind: 'idle' };
  let automatic = initialAutomatic;
  let allowMetered = initialAllowMetered;

  const getState = (): UpdateState => ({ ...info, automatic, allowMetered, status });
  const setStatus = (next: UpdateStatus) => {
    status = next;
    publish(getState());
  };
  const setAutomaticState = (next: boolean) => {
    automatic = next;
    publish(getState());
  };
  const setAllowMeteredState = (next: boolean) => {
    allowMetered = next;
    publish(getState());
  };

  const run = async (updateSource: UpdateSource, confirmed: boolean) => {
    setStatus({ kind: 'checking' });

    if (!confirmed && !allowMetered && (await isMeteredConnection())) return setStatus({ kind: 'metered' });

    const version = await checkForUpdate(updateSource, checkTimeout);

    if (!version) return setStatus({ kind: 'upToDate', checkedAt: Date.now() });

    setStatus({ kind: 'downloading', version, percent: 0 });
    await downloadUpdate(updateSource, (percent) => setStatus({ kind: 'downloading', version, percent }), downloadStallTimeout);
    setStatus({ kind: 'ready', version });
  };

  const start = async (confirmed: boolean) => {
    if (!source || ['checking', 'downloading', 'ready'].includes(status.kind)) return;

    await run(source, confirmed).catch((error) => {
      console.error('Update failed', error);
      setStatus({ kind: 'failed', message: errorMessage(error) });
    });
  };

  return {
    getState,
    check: () => start(false),
    confirmMetered: () => (status.kind === 'metered' ? start(true) : Promise.resolve()),
    cancelMetered: () => {
      if (status.kind === 'metered') setStatus({ kind: 'idle' });
    },
    setAutomatic: async (next) => {
      if (info.unavailable || next === automatic) return;

      const previous = automatic;
      setAutomaticState(next);
      await saveAutomatic(next).catch((error) => {
        console.error('The update setting was not saved', error);
        setAutomaticState(previous);
      });
    },
    setAllowMetered: async (next) => {
      if (info.unavailable || next === allowMetered) return;

      const previous = allowMetered;
      setAllowMeteredState(next);
      await saveAllowMetered(next).catch((error) => {
        console.error('The update setting was not saved', error);
        setAllowMeteredState(previous);
      });
    },
    install: () => {
      if (!source || status.kind !== 'ready') return;

      installUpdate(source);
    },
  };
};
