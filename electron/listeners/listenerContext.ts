import type { Database } from 'sqlite3';
import type { AppWindows } from '@shared/types/global';
import type { RadioBrowser } from '../services/radioBrowser';
import type { UpdateManager } from '../services/updateManager';

export interface ListenerContext {
  database: Database;
  windows: AppWindows;
  radio: RadioBrowser;
  updates: UpdateManager;
}
