export type UpdateUnavailableReason = 'development' | 'disabled' | 'flatpak' | 'managed';

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate'; checkedAt: number }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'failed'; message: string };

/** What the main process tells the settings about the installed app and its updates */
export interface UpdateState {
  version: string;
  electron: string;
  chrome: string;
  /** Why the app does not update itself, undefined where it does */
  unavailable: UpdateUnavailableReason | undefined;
  /** Whether the app checks for an update and installs it at start; the check in the settings works either way */
  automatic: boolean;
  status: UpdateStatus;
}
