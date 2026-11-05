import type { Database } from 'sqlite3';
import type { AppWindows } from '@shared/types/global';
import type { RadioBrowser } from '../services/radio-browser';
import type { UpdateManager } from '../services/update-manager';
import type { registerLoudness } from '../library/loudness/loudness-source';

export interface ListenerContext {
  database: Database;
  windows: AppWindows;
  radio: RadioBrowser;
  updates: UpdateManager;
  /** The measurement of the loudness of the library, which the settings ask how far it is and to start over */
  loudness: ReturnType<typeof registerLoudness>;
}
