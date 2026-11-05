import { resolve } from 'path';

// a dev run gets its own folder so it never touches the library of an installed app
// a test run names the folder the data goes in (TUNELLE_APP_DATA): the app data folder of macOS and Windows does not follow HOME, so a test would use the library of the user
const appDataPath = (appData: string, name: string, isDev: boolean, override?: string): string =>
  resolve(override || appData, `./${name}${isDev ? '-dev' : ''}`);

export default appDataPath;
