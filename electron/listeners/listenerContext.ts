import type { Database } from 'sqlite3';
import type { AppWindows } from '../../types/global';
import type { RadioBrowser } from '../services/radioBrowser';
import type { UpdateManager } from '../updateManager';

export interface ListenerContext {
  database: Database;
  windows: AppWindows;
  radio: RadioBrowser;
  updates: UpdateManager;
}
