import type { Database } from 'sqlite3';
import type { AppWindows } from '@shared/types/global';
import type { RadioBrowser } from '../services/radioBrowser';
import type { UpdateManager } from '../services/updateManager';
import type { ListenerContext } from './listenerContext';
import registerWindowListeners from './registerWindowListeners';
import registerStateListeners from './registerStateListeners';
import registerLibraryListeners from './registerLibraryListeners';
import registerPlaylistDownload from './registerPlaylistDownload';
import registerRadioListeners from './registerRadioListeners';
import registerFavouriteListeners from './registerFavouriteListeners';
import registerHistoryListeners from './registerHistoryListeners';
import registerPlaylistListeners from './registerPlaylistListeners';
import registerLauncherListeners from './registerLauncherListeners';
import registerUpdateListeners from './registerUpdateListeners';
import registerArtistPhotoListeners from './registerArtistPhotoListeners';
import registerMediaPermission from '../windows/mediaPermission';

const registrars: ((context: ListenerContext) => void)[] = [
  registerWindowListeners,
  registerStateListeners,
  registerLibraryListeners,
  registerPlaylistDownload,
  registerRadioListeners,
  registerFavouriteListeners,
  registerHistoryListeners,
  registerPlaylistListeners,
  registerLauncherListeners,
  registerUpdateListeners,
  registerArtistPhotoListeners,
  registerMediaPermission,
];

function setupListeners(database: Database, windows: AppWindows, radio: RadioBrowser, updates: UpdateManager) {
  registrars.forEach((register) => register({ database, windows, radio, updates }));
}

export default setupListeners;
