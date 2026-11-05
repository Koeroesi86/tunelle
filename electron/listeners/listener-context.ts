import type { Database } from 'sqlite3';
import type { AppWindows } from '@shared/types/global';
import type { RadioBrowser } from '../services/radio-browser';
import type { UpdateManager } from '../services/update-manager';

export interface ListenerContext {
  database: Database;
  windows: AppWindows;
  radio: RadioBrowser;
  updates: UpdateManager;
}
