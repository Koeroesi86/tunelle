import type { Database } from 'sqlite3';
import type { AppWindows } from '@shared/types/global';
import type { RadioBrowser } from '../services/radio-browser';
import type { UpdateManager } from '../services/update-manager';
import type { ListenerContext } from './listener-context';
import registerWindowListeners from './register-window-listeners';
import registerStateListeners from './register-state-listeners';
import registerLibraryListeners from './register-library-listeners';
import registerPlaylistDownload from './register-playlist-download';
import registerRadioListeners from './register-radio-listeners';
import registerFavouriteListeners from './register-favourite-listeners';
import registerHistoryListeners from './register-history-listeners';
import registerPlaylistListeners from './register-playlist-listeners';
import registerLauncherListeners from './register-launcher-listeners';
import registerUpdateListeners from './register-update-listeners';
import registerArtistPhotoListeners from './register-artist-photo-listeners';
import registerLoudnessListeners from './register-loudness-listeners';
import registerMprisListeners from './register-mpris-listeners';
import registerMediaPermission from '../windows/media-permission';

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
  registerLoudnessListeners,
  registerMprisListeners,
  registerMediaPermission,
];

function setupListeners(database: Database, windows: AppWindows, radio: RadioBrowser, updates: UpdateManager, loudness: ListenerContext['loudness']) {
  registrars.forEach((register) => register({ database, windows, radio, updates, loudness }));
}

export default setupListeners;
