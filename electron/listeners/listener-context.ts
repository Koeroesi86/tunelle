import type { Database } from 'sqlite3';
import type { AppWindows } from '@shared/types/global';
import type { RadioArt } from '../services/radio-art';
import type { RadioBrowser } from '../services/radio-browser';
import type { UpdateManager } from '../services/update-manager';
import type { registerLoudness } from '../library/loudness/loudness-source';

export interface ListenerContext {
  database: Database;
  windows: AppWindows;
  radio: RadioBrowser;
  /** The lookups of the music (MusicBrainz and the Cover Art Archive), which the covers of the radio and the search of the covers of albums share */
  radioArt: RadioArt;
  updates: UpdateManager;
  /** The measurement of the loudness of the library, which the settings ask how far it is and to start over */
  loudness: ReturnType<typeof registerLoudness>;
}
