/** The `build.appId` of package.json, which is not in the packaged copy of it (appUserModelId.test.ts keeps the two equal) */
export const installerAppId = 'io.github.koeroesi86.Tunelle';

/** The installed app uses the ID its NSIS shortcuts are created with, so notifications and taskbar pins group with them; a development run gets its own */
export const getAppUserModelId = (isDev: boolean, nodeEnv: string | undefined) => (isDev ? `${installerAppId}-${nodeEnv}` : installerAppId);

/** A Store package has an ID of its own (the package family and the application of its manifest) that its notifications and pins use, and a name set over it makes the system start a second app for a click on a notification */
export const setsAppUserModelId = (platform: NodeJS.Platform, windowsStore: boolean | undefined) => platform === 'win32' && !windowsStore;
